import * as  _ from 'lodash';
import * as uuid from 'uuid';
import * as childProcess from 'child_process';
import * as os from 'os';
import { IContentImport, ImportStatus, ImportSteps, IContentManifest } from './IContentImport'
import { Inject } from 'typescript-ioc';
import * as path from 'path';
import DatabaseSDK from './../../sdk/database';
import { logger } from '@project-sunbird/ext-framework-server/logger';
import { containerAPI } from 'OpenRAP/dist/api';
import { manifest } from '../../manifest';
import { IDesktopAppMetadata, IAddedUsingType } from '../../controllers/content/IContent';

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
    this.registerImportJob(['/Users/anoop/Documents/JS:TS Basics/src/Science - Part 2.ecar']);
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
        importStep: ImportSteps.copyEcar
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
    console.info('entering while loop', maxRunningImportJobs, this.runningImportJobs.length);
    let queuedJobIndex = 0;
    let updateQuery = [];
    while (maxRunningImportJobs > this.runningImportJobs.length && queuedJobs[queuedJobIndex]) {
      console.info('in while loop', queuedJobs[queuedJobIndex], this.runningImportJobs.length);
      const jobRunning: any = _.find(this.runningImportJobs, { id: queuedJobs[queuedJobIndex]._id }); // duplicate check
      if (!jobRunning) {
        queuedJobs[queuedJobIndex].importStatus = ImportStatus.inProgress;
        const jobReference = new ImportEcar(queuedJobs[queuedJobIndex], this.importJobCompletionCb.bind(this))
        jobReference.startImport();
        this.runningImportJobs.push({
          _id: queuedJobs[queuedJobIndex]._id,
          jobReference
        })
        updateQuery.push(queuedJobs[queuedJobIndex]);
      }
      queuedJobIndex++
    }
    if(updateQuery.length){
      await this.dbSDK.bulk('content_import', updateQuery);
    }
    console.info('exited while loop', queuedJobIndex, this.runningImportJobs.length);
  }

  private async importJobCompletionCb(err: any, data: IContentImport) {
    _.remove(this.runningImportJobs, job => job._id === data._id)
    // const importDbResults: IContentImport = await this.dbSDK.get('content_import', data._id)
    //   .catch(err => console.error('importJobCompletionCb error while fetching job details for ', data._id));
    if (err) {
      console.error('Import job failed for', data._id, ' with err', err);
      // if(importDbResults.importStatus !== ImportStatus.failed){
      //   importDbResults.importStatus = ImportStatus.failed;
      //   await this.dbSDK.update('content_import', data._id, importDbResults)
      //     .catch(err => console.error('importJobCompletionCb error while updating job details for ', data._id));
      // }
    } else {
      console.log('Import job completed for', data._id);
      // if(importDbResults.importStatus !== ImportStatus.completed){
      //   importDbResults.importStatus = ImportStatus.completed;
      //   await this.dbSDK.update('content_import', data._id, importDbResults)
      //     .catch(err => console.error('importJobCompletionCb error while updating job details for ', data._id));
      // }
    }
    this.checkImportQueue()
  }

  public async pauseImport(importId: string) {
    const importDbResults: IContentImport = await this.dbSDK.get('content_import', importId)
    .catch(err => console.error('pauseImport error while fetching job details for ', importId));
    if (!importDbResults || _.includes([ImportStatus.canceled, ImportStatus.completed, ImportStatus.failed], importDbResults.importStatus)) {
      throw "INVALID_OPERATION"
    }
    if (importDbResults.importStatus === ImportStatus.inProgress) {
      const inProgressJob: IRunningImportJobs = _.find(this.runningImportJobs, { _id: importId }); // running/in-progress job
      if (!inProgressJob) {
        throw "INVALID_OPERATION"
      }
      await inProgressJob.jobReference.pause();
      _.remove(this.runningImportJobs, job => job._id === inProgressJob._id) // update meta data in db 
      //TODO: update status as PAUSING and stop any further operation from ui and progress of content import
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
    if (!importDbResults || _.includes([ImportStatus.canceled, ImportStatus.completed, ImportStatus.failed], importDbResults.importStatus)) {
      throw "INVALID_OPERATION"
    }
    if (importDbResults.importStatus === ImportStatus.inProgress) {
      const inProgressJob: IRunningImportJobs = _.find(this.runningImportJobs, { _id: importId }); // running/in-progress job
      if (!inProgressJob) {
        throw "INVALID_OPERATION"
      }
      await inProgressJob.jobReference.cancel();
      _.remove(this.runningImportJobs, job => job._id === inProgressJob._id);
      //TODO: update status as CANCELING and stop any further operation from ui and progress of content import
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
        },
        ecarSourcePath: {
          "$in": ecarPaths
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
      console.error('Error while processContents for ', this.contentImportData._id);
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
      console.error('Error while processContents for ', this.contentImportData._id);
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
    let parent = _.get(this.contentImportData.manifest, 'archive.items[0]');
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
      let itemsClone = _.cloneDeep(_.get(this.contentImportData.manifest, 'archive.items'));
      parent.children = this.createHierarchy(itemsClone, parent);
      resources = _.filter(_.get(this.contentImportData.manifest, 'archive.items'), item => (item.mimeType !== 'application/vnd.ekstep.content-collection'))
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
      console.error('Error while processContents for ', this.contentImportData._id);
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
      if (data.message === ImportSteps.copyEcar) {
        this.copyEcar()
      } else if (data.message === ImportSteps.parseEcar) {
        this.extractEcar(data.contentImportData)
      } else if (data.message === ImportSteps.extractEcar) {
        this.processContents(data.contentImportData)
      } else if (data.message === ImportSteps.complete) {
        this.importComplete(data.contentImportData)
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

  private async syncStatusToDb() {
    const importDbResults: IContentImport = await this.dbSDK.get('content_import',  this.contentImportData._id)
    .catch(err => console.error('cancelImport error while fetching job details for ',  this.contentImportData._id));
    if(importDbResults){
      this.contentImportData._rev = importDbResults._rev;
      await this.dbSDK.update('content_import', this.contentImportData._id, this.contentImportData)
      .catch(err => console.error('syncStatusToDb error for', this.contentImportData._id, err));
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
    this.contentImportData.importStatus = ImportStatus.canceled;
    this.workerProcessRef.send({ message: 'KILL' });
  }
  async pause() {
    console.log('pausing running import job for', this.contentImportData._id);
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
