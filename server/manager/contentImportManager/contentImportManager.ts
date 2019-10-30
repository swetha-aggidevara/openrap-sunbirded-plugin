import * as  _ from 'lodash';
import * as uuid from 'uuid';
import * as childProcess from 'child_process';
import * as os from 'os';
import { IContentImport, ImportStatus, ImportSteps, IContentManifest, getErrorObj, handelError, ErrorObj } from './IContentImport'
import { Inject } from 'typescript-ioc';
import * as path from 'path';
import DatabaseSDK from './../../sdk/database';
import { logger } from '@project-sunbird/ext-framework-server/logger';
import { containerAPI } from 'OpenRAP/dist/api';
import { manifest } from '../../manifest';
import { IDesktopAppMetadata, IAddedUsingType } from '../../controllers/content/IContent';
import * as  fs from 'fs';

let pluginId: string;
console.info('System is running on', os.cpus().length, 'cpus');
const maxRunningImportJobs = 1 || os.cpus().length;

export class ContentImportManager {

  private runningImportJobs: Array<IRunningImportJobs> = [];
  private contentFilesPath: string;
  private fileSDK;
  @Inject dbSDK: DatabaseSDK;

  async initialize(plgId, contentFilesPath, downloadsFolderPath) {
    pluginId = plgId
    this.contentFilesPath = contentFilesPath;
    this.dbSDK.initialize(pluginId);
    this.fileSDK = containerAPI.getFileSDKInstance(manifest.id);
  }
  /*
  this method will be called when app initializes, all task related to import should be called after this method completes
  it updates all in-progress state content to RECONCILE status
  then checkImportQueue will be called, checkImportQueue will pick RECONCILE on priority and completes import task the task
  */
  public async reconcile() {
    let inProgressJob = await this.dbSDK.find('content_manager', { // TODO:Query needs to be optimized
      "selector": {
        type: IAddedUsingType.import,
        status: {
          "$in": [ImportStatus.inProgress]
        }
      }
    }).catch(err => { 
      console.log('reconcile error while fetching inProgress content from DB', err.message);
      return {docs: []}
    });
    console.info('list of inProgress jobs found while reconcile', inProgressJob.docs.length);
    if(inProgressJob.docs.length){
      const updateQuery: Array<IContentImport> = _.map(inProgressJob.docs, (job: IContentImport) => {
        job.status = ImportStatus.reconcile;
        return job;
      })
      await this.dbSDK.bulk('content_manager', updateQuery)
      .catch(err => {
        console.log('reconcile error while updating status to DB', err.message);
      });
    }
    this.checkImportQueue()
  }
  getEcarSize (filePath): Promise<number> {
    return new Promise((resolve, reject) => {
      fs.stat(filePath, (err, stats) => {
        if(err){
          return reject(err)
        }
        resolve(stats.size);
      })
    })
  }
  public async registerImportJob(ecarPaths: Array<string>): Promise<Array<string>> {
    console.info('registerImportJob started for ', ecarPaths);
    ecarPaths = await this.getUnregisteredEcars(ecarPaths)
    console.info('after unique check', ecarPaths);
    if (!ecarPaths || !ecarPaths.length) {
      console.debug('no unique ecar found, exiting registerImportJob');
      throw {
        errCode: "ECARS_ADDED_ALREADY",
        errMessage: "All ecar are added to content manager"
      }
    }
    const dbData: Array<IContentImport> = [];
    for(const ecarPath of ecarPaths){
      const contentSize = await this.getEcarSize(ecarPath).catch(handelError('ECAR_NOT_EXIST'));
      dbData.push({
        _id: uuid(),
        type: IAddedUsingType.import,
        name: path.basename(ecarPath),
        status: ImportStatus.inQueue,
        contentSize: contentSize,
        createdOn: Date.now(),
        updatedOn: Date.now(),
        ecarSourcePath: ecarPath,
        importStep: ImportSteps.copyEcar,
        progress: 0,
        extractedEcarEntries: {},
        artifactUnzipped: {}
      });
    }
    await this.dbSDK.bulk('content_manager', dbData);
    this.checkImportQueue();
    return dbData.map(data => data._id)
  }

  private async checkImportQueue(status: Array<ImportStatus> = [ImportStatus.reconcile, ImportStatus.resume, ImportStatus.inQueue]) {
    let dbResponse = await this.dbSDK.find('content_manager', { // TODO:Query needs to be optimized
      "selector": {
        type: IAddedUsingType.import,
        status: {
          "$in": status
        }
      },
      sort: ['status']
    }).catch(err => {
      console.log('Error while fetching queued jobs', err);
      return { docs:[]}
    });
    if (this.runningImportJobs.length >= maxRunningImportJobs) {
      console.debug('no slot available to import, exiting');
      return;
    }
    console.info('-------------list of queued jobs-------------', dbResponse);
    const queuedJobs: Array<IContentImport> = dbResponse.docs;
    if (!queuedJobs.length) {
      console.debug('no queued jobs in db, exiting');
      return;
    }
    console.info('entering while loop', this.runningImportJobs.length, queuedJobs.length);
    let queuedJobIndex = 0;
    while (maxRunningImportJobs > this.runningImportJobs.length && queuedJobs[queuedJobIndex]) {
      console.info('in while loop', queuedJobs[queuedJobIndex], this.runningImportJobs.length);
      const jobRunning: any = _.find(this.runningImportJobs, { id: queuedJobs[queuedJobIndex]._id }); // duplicate check
      if (!jobRunning) {
        const jobReference = new ImportEcar(queuedJobs[queuedJobIndex], this.importJobCompletionCb.bind(this))
        jobReference.startImport();
        this.runningImportJobs.push({
          _id: queuedJobs[queuedJobIndex]._id,
          jobReference
        })
      }
      queuedJobIndex++
    }
    console.info('exited while loop', queuedJobIndex, this.runningImportJobs.length);
  }

  private async importJobCompletionCb(err: any, data: IContentImport) {
    _.remove(this.runningImportJobs, job => job._id === data._id)
    if (err) {
      console.error('Import job failed for', data._id, ' with err', err);
    } else {
      console.log('Import job completed for', data._id);
    }
    this.checkImportQueue()
  }

  public async pauseImport(importId: string) {
    const importDbResults: IContentImport = await this.dbSDK.get('content_manager', importId)
    .catch(err => console.error('pauseImport error while fetching job details for ', importId));
    if (!importDbResults || _.includes([ImportStatus.canceled, ImportStatus.completed, ImportStatus.failed, ImportStatus.pausing, ImportStatus.canceling], importDbResults.status)) {
      throw "INVALID_OPERATION"
    }
    if (importDbResults.status === ImportStatus.inProgress) {
      const inProgressJob: IRunningImportJobs = _.find(this.runningImportJobs, { _id: importId }); // running/in-progress job
      if (!inProgressJob) {
        throw "INVALID_OPERATION"
      }
      inProgressJob.jobReference.pause();
      _.remove(this.runningImportJobs, job => job._id === inProgressJob._id) // update meta data in db 
    } else {
      importDbResults.status = ImportStatus.paused; // update db with new status
      await this.dbSDK.update('content_manager', importId, importDbResults)
        .catch(err => console.error('pauseImport error while updating job details for ', importId));
    }
    this.checkImportQueue();
  }

  public async resumeImport(importId: string) {
    const importDbResults: IContentImport = await this.dbSDK.get('content_manager', importId)
    .catch(err => console.error('resumeImport error while fetching job details for ', importId));
    if (!importDbResults || !_.includes([ImportStatus.paused], importDbResults.status)) {
      throw "INVALID_OPERATION"
    }
    importDbResults.status = ImportStatus.resume;
    await this.dbSDK.update('content_manager', importId, importDbResults)
      .catch(err => console.error('resumeImport error while updating job details for ', importId));
    this.checkImportQueue();
  }

  public async cancelImport(importId: string) {
    const importDbResults: IContentImport = await this.dbSDK.get('content_manager', importId)
    .catch(err => console.error('cancelImport error while fetching job details for ', importId));
    if (!importDbResults || _.includes([ImportStatus.canceled, ImportStatus.canceling, ImportStatus.completed, ImportStatus.failed], importDbResults.status)) {
      throw "INVALID_OPERATION"
    }
    if (importDbResults.status === ImportStatus.inProgress) {
      const inProgressJob: IRunningImportJobs = _.find(this.runningImportJobs, { _id: importId }); // running/in-progress job
      if (!inProgressJob) {
        throw "INVALID_OPERATION"
      }
      inProgressJob.jobReference.cancel();
      _.remove(this.runningImportJobs, job => job._id === inProgressJob._id);
    } else {
      importDbResults.status = ImportStatus.canceled;
      await this.dbSDK.update('content_manager', importId, importDbResults)
        .catch(err => console.error('cancelImport error while updating job details for ', importId));
    }
    this.checkImportQueue();
  }

  private async getUnregisteredEcars(ecarPaths: Array<string>): Promise<Array<string>> {
    const registeredEcars = await this.dbSDK.find('content_manager', {
      "selector": {
        type: IAddedUsingType.import,
        status: {
          "$in": [ImportStatus.inProgress, ImportStatus.inQueue, ImportStatus.reconcile, ImportStatus.resume]
        }
      }
    });
    ecarPaths = _.filter(ecarPaths, ecarPath => {
      if (_.find(registeredEcars.docs, { ecarSourcePath: ecarPath })) {
        console.log('skipping import for ', ecarPath, ' as its already registered');
        return false;
      } else {
        return true
      }
    })
    return ecarPaths;
  }
}


interface IRunningImportJobs {
  _id: string;
  jobReference: ImportEcar
}
class ImportEcar {

  workerProcessRef: childProcess.ChildProcess;
  contentManifest: any;
  fileSDK: any;
  contentFolder: string;
  ecarFolder: string;
  @Inject dbSDK: DatabaseSDK;
  manifestJson: any;

  constructor(private contentImportData: IContentImport, private cb) {
    this.dbSDK.initialize(pluginId);
    this.fileSDK = containerAPI.getFileSDKInstance(manifest.id);
    this.contentFolder = this.fileSDK.getAbsPath('content');
    this.ecarFolder = this.fileSDK.getAbsPath('ecars');
    this.workerProcessRef = childProcess.fork(path.join(__dirname, 'contentImportHelper'));
    this.handleChildProcessMessage();
    this.handleWorkerCloseEvents();
  }

  async startImport(step = this.contentImportData.importStep) {
    this.contentImportData.status = ImportStatus.inProgress;
    this.contentImportData.progress = 0;
    await this.syncStatusToDb();
    switch (step) {
      case ImportSteps.copyEcar: {
        this.workerProcessRef.send({
          message: this.contentImportData.importStep,
          contentImportData: this.contentImportData
        });
        break;
      }
      case ImportSteps.parseEcar: {
        this.workerProcessRef.send({
          message: this.contentImportData.importStep,
          contentImportData: this.contentImportData
        });
        break;
      }
      case ImportSteps.extractEcar: {
        this.extractEcar()
        break;
      }
      case ImportSteps.processContents: {
        this.processContents()
        break;
      }
      default: {
        this.handleChildProcessError({ errCode: "UNHANDLED_IMPORT_STEP", errMessage: "unsupported import step"});
        break;
      }
    }
  }
  /** 
   * _id, _rev, ImportStep, ImportStatus should not be copied from child. Parent will handle status update and import progress
  */
  saveDataFromWorker(contentImportData: IContentImport){
    this.contentImportData = { ...this.contentImportData,
      ..._.pick(contentImportData, ['childNodes', 'contentId', 'contentType', 'extractedEcarEntries', 'artifactUnzipped', 'progress', 'contentSize'])}
  }
  private async extractEcar() {
    try {
      if(this.contentImportData.importStep !== ImportSteps.extractEcar){
        this.contentImportData.importStep = ImportSteps.extractEcar;
        await this.syncStatusToDb();
      }
      const contentIds = [this.contentImportData.contentId];
      if (this.contentImportData.childNodes) {
        contentIds.push(...this.contentImportData.childNodes)
      }
      const dbContents = await this.getContentsFromDB(contentIds);
      this.workerProcessRef.send({
        message: this.contentImportData.importStep,
        contentImportData: this.contentImportData,
        dbContents
      });
    } catch (err) {
      console.error(this.contentImportData._id, 'Error while processContents ', err);
      this.contentImportData.status = ImportStatus.failed;
      await this.syncStatusToDb();
      this.cb('ERROR', this.contentImportData);
      this.cleanUpFolders();
    }
  }

  async processContents() {
    try {
      if(this.contentImportData.importStep !== ImportSteps.processContents){
        this.contentImportData.importStep = ImportSteps.processContents;
        await this.syncStatusToDb();
      }
      const contentIds = [this.contentImportData.contentId];
      if (this.contentImportData.childNodes) {
        contentIds.push(...this.contentImportData.childNodes)
      }
      const dbContents = await this.getContentsFromDB(contentIds);
      await this.saveContentsToDb(dbContents)
      this.contentImportData.importStep = ImportSteps.complete;
      this.contentImportData.status = ImportStatus.completed;
      await this.syncStatusToDb();
      this.cb(null, this.contentImportData);
    } catch (err) {
      console.error(this.contentImportData._id, 'Error while processContents for ', err);
      this.contentImportData.status = ImportStatus.failed;
      this.contentImportData.failedCode = err.errCode || "CONTENT_SAVE_FAILED";
      this.contentImportData.failedReason = err.errMessage;
      await this.syncStatusToDb();
      this.cb('ERROR', this.contentImportData);
      this.cleanUpFolders();
    } finally {
      this.workerProcessRef.kill('SIGHUP');
    }
  }

  private async saveContentsToDb(dbContents) {
    console.info(this.contentImportData._id, 'saving contents to db');
    this.manifestJson = await this.fileSDK.readJSON(path.join(path.join(this.fileSDK.getAbsPath('content'), this.contentImportData.contentId), 'manifest.json'));
    let parent = _.get(this.manifestJson, 'archive.items[0]');
    parent._id = parent.identifier;
    const dbParent: any = _.find(dbContents, {identifier: parent.identifier});
    if(dbParent){
      parent._rev = dbParent._rev;
    }
    parent.baseDir = `content/${parent.identifier}`;
    parent.desktopAppMetadata = {
      "addedUsing": IAddedUsingType.import,
      "createdOn": Date.now(),
      "updatedOn": Date.now(),
    }
    let resources = [];
    if (this.contentImportData.contentType === 'application/vnd.ekstep.content-collection') {
      let itemsClone = _.cloneDeep(_.get(this.manifestJson, 'archive.items'));
      parent.children = this.createHierarchy(itemsClone, parent);
      resources = _.filter(_.get(this.manifestJson, 'archive.items'), item => (item.mimeType !== 'application/vnd.ekstep.content-collection'))
        .map(resource => {
          resource._id = resource.identifier;
          resource.baseDir = `content/${resource.identifier}`;
          resource.desktopAppMetadata = {
            "addedUsing": IAddedUsingType.import,
            "createdOn": Date.now(),
            "updatedOn": Date.now(),
          }
          resource.appIcon = resource.appIcon ? `content/${resource.appIcon}` : resource.appIcon;
          const dbResource: any = _.find(dbContents, {identifier: parent.identifier});
          if(dbResource){
            resource._rev = dbResource._rev;
            resource.visibility = dbResource.visibility;
          }
          return resource;
        });
    }
    await this.dbSDK.bulk('content', [parent, ...resources]);
  }

  async importComplete() {
    if (this.contentImportData.importStep !== ImportSteps.complete) {
      this.contentImportData.importStep = ImportSteps.complete;
      this.contentImportData.status = ImportStatus.completed;
      await this.syncStatusToDb();
    }
    this.cb(null, this.contentImportData);
    this.workerProcessRef.kill('SIGHUP');
  }

  private async copyEcar() {
    this.contentImportData.importStep = ImportSteps.parseEcar
    await this.syncStatusToDb();
    this.workerProcessRef.send({
      message: this.contentImportData.importStep,
      contentImportData: this.contentImportData
    });
  }

  async handleChildProcessMessage() {
    this.workerProcessRef.on('message', async (data) => {
      console.log('Message from child process for importId:' + _.get(data, 'contentImportData._id'), data.message);
      if(data.contentImportData){
        this.saveDataFromWorker(data.contentImportData); // save only required data from child, 
      }
      if (data.message === ImportSteps.copyEcar) {
        this.copyEcar()
      } else if (data.message === ImportSteps.parseEcar) {
        this.extractEcar()
      } else if (data.message === ImportSteps.extractEcar) {
        this.processContents()
      } else if (data.message === ImportSteps.complete) {
        this.importComplete()
      } else if (data.message === "DATA_SYNC") {
        this.syncStatusToDb()
      } else if (data.message === "DATA_SYNC_KILL") {
        this.handleKillSignal();
      } else if (data.message === 'IMPORT_ERROR') {
        this.handleChildProcessError(data.err);
      } else {
        this.handleChildProcessError({ errCode: "UNHANDLED_WORKER_MESSAGE", errMessage: "unsupported import step"});
      }
    });
  }
  handleWorkerCloseEvents() {
    this.workerProcessRef.on('exit', (code, signal) => {
      console.log(this.contentImportData._id, 'Child process exited with', code, signal);
      if(signal === 'SIGHUP'){
        return;
      }
      if (!_.includes([ImportStatus.canceled, ImportStatus.paused], this.contentImportData.status)) {
        this.handleUnexpectedChildProcessExit(code, signal);
      }
    });
  }
  async handleUnexpectedChildProcessExit(code, signal){
    console.error('Unexpected exit of child process for importId', this.contentImportData._id, 'with signal and code', code, signal);
    this.contentImportData.status = ImportStatus.failed; // this line should not be removed
    this.contentImportData.failedCode = "WORKER_UNHANDLED_EXCEPTION";
    this.contentImportData.failedReason = "Import Worker exited while processing ECar";
    await this.syncStatusToDb();
    this.cleanUpFolders();
  }
  private async handleChildProcessError(err: ErrorObj) {
    console.error(this.contentImportData._id, 'Got error while importing ecar with importId:', err);
    this.contentImportData.failedCode = err.errCode;
    this.contentImportData.failedReason = err.errMessage;
    this.contentImportData.status = ImportStatus.failed;
    await this.syncStatusToDb();
    this.cb(err, this.contentImportData);
    this.cleanUpFolders();
  }
  cleanUpFolders(){
    // delete ecar folder and extracted content folders
  }

  private async syncStatusToDb() {
    console.info(this.contentImportData._id, 'progress with import step', this.contentImportData.progress, this.contentImportData.importStep);
    this.contentImportData.progress > 100 ? 99: this.contentImportData.progress;
    this.contentImportData.updatedOn = Date.now();
    let dbResponse = await this.dbSDK.update('content_manager', this.contentImportData._id, this.contentImportData) // TODO: Revision and compaction to be handled
    .catch(async err => {
      console.error('syncStatusToDb error for', this.contentImportData._id, 'with status and code', err.status, err.name)
      if(err.status === 409 && err.name === 'conflict'){
        const jobDb: IContentImport = await this.dbSDK.get('content_manager', this.contentImportData._id);
        if(jobDb && jobDb._rev){
          this.contentImportData._rev = jobDb._rev;
          return await this.dbSDK.update('content_manager', this.contentImportData._id, this.contentImportData);
        }
      }
    });
    if(dbResponse && dbResponse.rev){
      this.contentImportData._rev = dbResponse.rev;
    }
  }
  private async getContentsFromDB(contentIds: Array<any>) {
    const dbResults = await this.dbSDK.find('content', {
      "selector": {
        identifier: {
          "$in": contentIds
        }
      }
    }).catch(err => undefined);
    return _.get(dbResults, 'docs') ? dbResults.docs : []
  }
  async cancel() {
    console.log('canceling running import job for', this.contentImportData._id);
    this.contentImportData.status = ImportStatus.canceling;
    await this.syncStatusToDb();
    this.contentImportData.status = ImportStatus.canceled;
    this.workerProcessRef.send({ message: 'KILL' });
  }
  async pause() {
    console.log('pausing running import job for', this.contentImportData._id);
    this.contentImportData.status = ImportStatus.pausing; // update db with new status
    await this.syncStatusToDb();
    this.contentImportData.status = ImportStatus.paused;
    this.workerProcessRef.send({ message: 'KILL' });
  }
  async handleKillSignal() {
    this.workerProcessRef.kill('SIGHUP');
    console.log(this.contentImportData._id, 'kill signal from child', this.contentImportData.status, this.contentImportData.importStep);
    if (this.contentImportData.status === ImportStatus.paused) {
      this.contentImportData.status = ImportStatus.paused; // this line should not be removed
    } else if(this.contentImportData.status === ImportStatus.canceled) {
      this.contentImportData.status = ImportStatus.canceled; // this line should not be removed
      this.cleanUpFolders();
    }
    await this.syncStatusToDb();
  }
  private createHierarchy(items: any[], parent: any, tree?: any[]): any {
    tree = typeof tree !== 'undefined' ? tree : [];
    parent = typeof parent !== 'undefined' ? parent : { visibility: 'Default' };
    if (parent.children && parent.children.length) {
      let children = [];
      _.forEach(items, (child) => {
        let childWithIndex = _.find(parent.children, { 'identifier': child.identifier })
        if (!_.isEmpty(childWithIndex)) {
          child.index = childWithIndex['index'];
          children.push(child)
        }
      });
      if (!_.isEmpty(children)) {
        children = _.sortBy(children, 'index');
        if (parent.visibility === 'Default') {
          tree = children;
        } else {
          parent['children'] = children;
        }
        _.each(children, (child) => { this.createHierarchy(items, child) });
      }
    }
    return tree;
  }
}
