import * as  _ from 'lodash';
import * as uuid from 'uuid';
import * as childProcess from 'child_process';
import * as os from 'os';
import { IContentImport, ImportStatus, ImportSteps, IContentManifest, ImportProgress } from './IContentImport'
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
    let inProgressJob = await this.dbSDK.find('content_import', {
      "selector": {
        importStatus: {
          "$in": [ImportStatus.inProgress]
        }
      }
    });
    console.info('list of inProgress jobs found while reconcile', inProgressJob.docs.length);
    if(inProgressJob.docs.length){
      const updateQuery: Array<IContentImport> = _.map(inProgressJob.docs, (job: IContentImport) => {
        job.importStatus = ImportStatus.reconcile;
        return job;
      })
      await this.dbSDK.bulk('content_import', updateQuery);
    }
    this.checkImportQueue()
  }

  public async registerImportJob(ecarPaths: Array<string>): Promise<Array<string>> {
    console.info('registerImportJob started for ', ecarPaths);
    ecarPaths = await this.getUnregisteredEcars(ecarPaths)
    console.info('after unique check', ecarPaths);
    if (!ecarPaths || !ecarPaths.length) {
      console.debug('no unique ecar found, exiting registerImportJob');
      return [];
    }
    const dbData: Array<IContentImport> = _.map(ecarPaths, (ecarPath: string): IContentImport => ({
        _id: uuid(),
        importStatus: ImportStatus.inQueue,
        createdOn: Date.now(),
        ecarSourcePath: ecarPath,
        importStep: ImportSteps.copyEcar,
        importProgress: 0,
        ecarFileCopied: 0
      }));
    await this.dbSDK.bulk('content_import', dbData);
    this.checkImportQueue();
    return dbData.map(data => data._id)
  }

  private async checkImportQueue(status: Array<ImportStatus> = [ImportStatus.reconcile, ImportStatus.resume, ImportStatus.inQueue]) {
    let { docs } = await this.dbSDK.find('content_import', {
      "selector": {
        importStatus: {
          "$in": status
        }
      }
    });
    if (this.runningImportJobs.length >= maxRunningImportJobs) {
      console.debug('no slot available to import, exiting');
      return;
    }
    console.info('-------------list of queued jobs-------------', docs);
    const queuedJobs: Array<IContentImport> = docs;
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
    const importDbResults: IContentImport = await this.dbSDK.get('content_import', importId)
    .catch(err => console.error('pauseImport error while fetching job details for ', importId));
    if (!importDbResults || _.includes([ImportStatus.canceled, ImportStatus.completed, ImportStatus.failed, ImportStatus.pausing, ImportStatus.canceling], importDbResults.importStatus)) {
      throw "INVALID_OPERATION"
    }
    if (importDbResults.importStatus === ImportStatus.inProgress) {
      const inProgressJob: IRunningImportJobs = _.find(this.runningImportJobs, { _id: importId }); // running/in-progress job
      if (!inProgressJob) {
        throw "INVALID_OPERATION"
      }
      inProgressJob.jobReference.pause();
      _.remove(this.runningImportJobs, job => job._id === inProgressJob._id) // update meta data in db 
    } else {
      importDbResults.importStatus = ImportStatus.paused; // update db with new status
      await this.dbSDK.update('content_import', importId, importDbResults)
        .catch(err => console.error('pauseImport error while updating job details for ', importId));
    }
    this.checkImportQueue();
  }

  public async resumeImport(importId: string) {
    const importDbResults: IContentImport = await this.dbSDK.get('content_import', importId)
    .catch(err => console.error('resumeImport error while fetching job details for ', importId));
    if (!importDbResults || !_.includes([ImportStatus.paused], importDbResults.importStatus)) {
      throw "INVALID_OPERATION"
    }
    importDbResults.importStatus = ImportStatus.resume;
    await this.dbSDK.update('content_import', importId, importDbResults)
      .catch(err => console.error('resumeImport error while updating job details for ', importId));
    this.checkImportQueue();
  }

  public async cancelImport(importId: string) {
    const importDbResults: IContentImport = await this.dbSDK.get('content_import', importId)
    .catch(err => console.error('cancelImport error while fetching job details for ', importId));
    if (!importDbResults || _.includes([ImportStatus.canceled, ImportStatus.canceling, ImportStatus.completed, ImportStatus.failed], importDbResults.importStatus)) {
      throw "INVALID_OPERATION"
    }
    if (importDbResults.importStatus === ImportStatus.inProgress) {
      const inProgressJob: IRunningImportJobs = _.find(this.runningImportJobs, { _id: importId }); // running/in-progress job
      if (!inProgressJob) {
        throw "INVALID_OPERATION"
      }
      inProgressJob.jobReference.cancel();
      _.remove(this.runningImportJobs, job => job._id === inProgressJob._id);
    } else {
      importDbResults.importStatus = ImportStatus.canceled;
      await this.dbSDK.update('content_import', importId, importDbResults)
        .catch(err => console.error('cancelImport error while updating job details for ', importId));
    }
    this.checkImportQueue();
  }

  private async getUnregisteredEcars(ecarPaths: Array<string>): Promise<Array<string>> {
    const registeredEcars = await this.dbSDK.find('content_import', {
      "selector": {
        importStatus: {
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
    this.contentImportData.importStatus = ImportStatus.inProgress;
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
      case ImportSteps.extractArtifact: {
        this.extractEcar()
        break;
      }
      case ImportSteps.processContents: {
        this.processContents()
        break;
      }
      default: {
        this.handleChildProcessError('UNHANDLED_IMPORT_STEP', {});
        break;
      }
    }
  }

  private async extractEcar(contentImportData?) {
    try {
      if (contentImportData) {
        this.contentImportData = contentImportData;
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
      this.contentImportData.importStatus = ImportStatus.failed;
      await this.syncStatusToDb();
      this.cb('ERROR', this.contentImportData);
      this.cleanUpFolders();
    }
  }

  async processContents(contentImportData?) {
    try {
      if (contentImportData) {
        this.contentImportData = contentImportData;
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
      this.contentImportData.importStatus = ImportStatus.completed;
      await this.syncStatusToDb();
      this.cb(null, this.contentImportData);
    } catch (err) {
      console.error('Error while processContents for ', this.contentImportData._id, err);
      this.contentImportData.importStatus = ImportStatus.failed;
      await this.syncStatusToDb();
      this.cb('ERROR', this.contentImportData);
      this.cleanUpFolders();
    } finally {
      this.workerProcessRef.kill('SIGHUP');
    }
  }

  private async saveContentsToDb(dbContents) {
    console.log('saving contents to db');
    if(!this.manifestJson){
      this.manifestJson = JSON.parse(fs.readFileSync(path.join(path.join(this.fileSDK.getAbsPath('content'), this.contentImportData.contentId), 'manifest.json'), 'utf8'));
    }
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

  async importComplete(contentImportData) {
    try {
      if (contentImportData) {
        this.contentImportData = contentImportData;
        this.contentImportData.importStep = ImportSteps.complete;
        await this.syncStatusToDb();
      }
      this.cb(null, this.contentImportData);
    } catch (err) {
      console.error('Error while processContents for ', this.contentImportData._id, err);
      this.contentImportData.importStatus = ImportStatus.failed;
      await this.syncStatusToDb();
      this.cb('ERROR', this.contentImportData);
      this.cleanUpFolders();
    } finally {
      this.workerProcessRef.kill('SIGHUP');
    }
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
        data.contentImportData._rev = this.contentImportData._rev; // this line prevents conflict: Document update conflict of pouchDb
        data.contentImportData.importStatus = this.contentImportData.importStatus; // this line preserves importStatus
      }
      if (data.message === ImportSteps.copyEcar) {
        this.copyEcar()
      } else if (data.message === ImportSteps.parseEcar) {
        this.extractEcar(data.contentImportData)
      } else if (data.message === ImportSteps.extractEcar || data.message === ImportSteps.extractArtifact ) {
        this.processContents(data.contentImportData)
      } else if (data.message === ImportSteps.complete) {
        this.importComplete(data.contentImportData)
      } else if (data.message === "DATA_SYNC") {
        console.log('-------------------DATA_SYNC----------------------------');
        this.syncStatusToDb(data.contentImportData)
      } else if (data.message === "DATA_SYNC_KILL") {
        this.handleKillSignal(data.contentImportData);
      } else if (data.message === 'IMPORT_ERROR') {
        this.handleChildProcessError(data.message, data.err,  data.contentImportData);
      } else {
        this.handleChildProcessError('UNHANDLED_WORKER_MESSAGE', data.err, data.contentImportData);
      }
    });
  }
  handleWorkerCloseEvents() {
    this.workerProcessRef.on('exit', (code, signal) => {
      console.log('------------------CHILD_PROCESS_EXIT-------------------', code, signal);
      if(signal === 'SIGHUP'){
        return;
      }
      if (!_.includes([ImportStatus.canceled, ImportStatus.paused], this.contentImportData.importStatus)) {
        this.handleUnexpectedChildProcessExit(code, signal);
      }
    });
  }
  async handleUnexpectedChildProcessExit(code, signal){
    console.error('Unexpected exit of child process for importId', this.contentImportData._id, 'with signal and code', code, signal);
    this.contentImportData.importStatus = ImportStatus.failed; // this line should not be removed
    await this.syncStatusToDb();
    this.cleanUpFolders();
  }
  private async handleChildProcessError(message, err = {}, contentImportData?) {
    try {
      console.error('Got error while importing ecar with importId:', this.contentImportData._id);
      console.error(err)
      if (contentImportData) {
        this.contentImportData = contentImportData;
      }
      this.contentImportData.importStatus = ImportStatus.failed;
      await this.syncStatusToDb();
    } catch(err) {
      console.error('Error while handling error for ', this.contentImportData._id)
    } finally {
      this.cb(message, this.contentImportData);
      this.workerProcessRef.kill('SIGHUP');
    }
  }
  cleanUpFolders(){
    // delete ecar folder and extracted content folders
  }
  getProgress(){
    if(!ImportProgress[this.contentImportData.importStep]){
      return this.contentImportData.importProgress;
    }
    let progress = ImportProgress[this.contentImportData.importStep];
    if(this.contentImportData.importStep === ImportSteps.extractEcar && this.contentImportData.ecarEntriesCount){
      let extractedEntries = _.values(this.contentImportData.extractedEcarEntriesCount).length;
      extractedEntries = extractedEntries ? extractedEntries : 1;
      let newProgress = (extractedEntries / this.contentImportData.ecarEntriesCount) * 60
      progress = progress + newProgress;
    } else if(this.contentImportData.importStep === ImportSteps.extractArtifact && this.contentImportData.artifactCount) {
      let extractedArtifacts = _.values(this.contentImportData.artifactUnzipped).length;
      extractedArtifacts = extractedArtifacts ? extractedArtifacts : 1;
      let newProgress = (extractedArtifacts/this.contentImportData.artifactCount) * 13
      progress = progress + newProgress;
    } else if(this.contentImportData.importStep === ImportSteps.copyEcar){
      progress = progress + this.contentImportData.ecarFileCopied;
      this.contentImportData.ecarFileCopied = 0;
    }
    console.info(`Import progress for job id ${this.contentImportData}: ${progress}` )
    return progress;
  }
  private async syncStatusToDb(contentImportData?) {
    if(contentImportData){
      this.contentImportData = contentImportData;
    }
    this.contentImportData.importProgress = this.getProgress()
    let dbResponse = await this.dbSDK.update('content_import', this.contentImportData._id, this.contentImportData)
    .catch(async err => {
      console.error('syncStatusToDb error for', this.contentImportData._id, 'with status and code', err.status, err.name)
      if(err.status === 409 && err.name === 'conflict'){
        const jobDb: IContentImport = await this.dbSDK.get('content_import', this.contentImportData._id);
        if(jobDb && jobDb._rev){
          this.contentImportData._rev = jobDb._rev;
          return await this.dbSDK.update('content_import', this.contentImportData._id, this.contentImportData);
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
    this.contentImportData.importStatus = ImportStatus.canceling;
    await this.syncStatusToDb();
    this.contentImportData.importStatus = ImportStatus.canceled;
    this.workerProcessRef.send({ message: 'KILL' });
  }
  async pause() {
    console.log('pausing running import job for', this.contentImportData._id);
    this.contentImportData.importStatus = ImportStatus.pausing; // update db with new status
    await this.syncStatusToDb();
    this.contentImportData.importStatus = ImportStatus.paused;
    this.workerProcessRef.send({ message: 'KILL' });
  }
  async handleKillSignal(contentImportData) {
    this.workerProcessRef.kill('SIGHUP');
    console.log('kill signal from child', this.contentImportData.importStatus, this.contentImportData.importStep);
    if (this.contentImportData.importStatus === ImportStatus.paused) {
      this.contentImportData = contentImportData;
      this.contentImportData.importStatus = ImportStatus.paused; // this line should not be removed
    } else if(this.contentImportData.importStatus === ImportStatus.canceled) {
      this.contentImportData = contentImportData;
      this.contentImportData.importStatus = ImportStatus.canceled; // this line should not be removed
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
