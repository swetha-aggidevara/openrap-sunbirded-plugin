import * as  _ from 'lodash';
import * as uuid from 'uuid';
import * as childProcess from 'child_process';
import * as os from 'os';
import * as  fs from 'fs';
import {IContentImport, ImportStatus, ImportSteps, IContentManifest} from './IContentImport'
const contentFolder = "./content/";
const ecarFolder = "./ecar/";
console.info('System is running on', os.cpus().length, 'cpus');
const maxRunningImportJobs = 1 || os.cpus().length;
let contentImportDB: Array<IContentImport> = [
//   {
//   id: '123',
//   importStatus: ImportStatus.reconcile,
//   createdOn: Date.now(),
//   ecarSourcePath: './src/10 ಗಣಿತ ಭಾಗ 1.ecar',
//   importStep: ImportSteps.copyEcar
// }
];

export class ContentImportManager {

  private runningImportJobs: Array<IRunningImportJobs> = [];
  /*
  this method will be called when app initializes, all task related to import should be called after this method completes
  it updates all in-progress state content to RECONCILE status
  then checkImportQueue will be called, checkImportQueue will pick RECONCILE on priority and completes import task the task
  */
  public async reconcile() {
    _.forEach(contentImportDB, (eachContent: IContentImport) => {
      if (eachContent.importStatus === ImportStatus.inProgress) {
        eachContent.importStatus = ImportStatus.reconcile
      }
    }); // for all in-progress task in db, update status to RECONCILE
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
      id: uuid(),
      importStatus: ImportStatus.inQueue,
      createdOn: Date.now(),
      ecarSourcePath: ecarPath,
      importStep: ImportSteps.copyEcar
    }))
    contentImportDB.push(...dbData); // insert to contentImport DB
    this.checkImportQueue();
    return dbData.map(data => data.id)
  }

  private async checkImportQueue(status: Array<ImportStatus> = [ImportStatus.reconcile, ImportStatus.resume, ImportStatus.inQueue]) {
    console.info('checkImportQueue method called', contentImportDB);
    if (this.runningImportJobs.length >= maxRunningImportJobs) {
      console.debug('no slot available to import, exiting');
      return;
    }
    const queuedJobs = _.filter(contentImportDB, job => _.includes(status, job.importStatus)) // get IN_QUEUE jobs from db
    console.info('list of queued jobs', queuedJobs);
    if (!queuedJobs.length) {
      console.debug('no queued jobs in db, exiting');
      return;
    }
    console.info('entering while loop', maxRunningImportJobs, this.runningImportJobs.length);
    let queuedJobIndex = 0;
    while (maxRunningImportJobs > this.runningImportJobs.length && queuedJobs[queuedJobIndex]) {
      console.info('in while loop', queuedJobs[queuedJobIndex], this.runningImportJobs.length);
      const jobRunning: any = _.find(this.runningImportJobs, { id: queuedJobs[queuedJobIndex].id }); // duplicate check
      if (!jobRunning) {
        const jobReference = new ImportEcar(queuedJobs[queuedJobIndex], this.importJobCompletionCb.bind(this))
        jobReference.startImport();
        this.runningImportJobs.push({
          id: queuedJobs[queuedJobIndex].id,
          jobReference
        })
      }
      const importDbResults: IContentImport = _.find(contentImportDB, { id: queuedJobs[queuedJobIndex].id }); // find import job in db
      importDbResults.importStatus = ImportStatus.inProgress // update status to in-progress in db
      queuedJobIndex++
    }
    console.info('exited while loop', queuedJobIndex, this.runningImportJobs.length);
  }
  private importJobCompletionCb(err: any, data: IContentImport) {
    if (err) {
      console.error('error will importing content with id', data.id, 'err', err);
      const importDbResults: IContentImport = _.find(contentImportDB, { id: data.id }); // find import job in db
      importDbResults.importStatus = ImportStatus.failed // update status to failed in db
    } else {
      console.log('completed import job for ', data.id, this.runningImportJobs.length);
      _.remove(this.runningImportJobs, job => job.id === data.id) // update meta data in db 
      console.log(this.runningImportJobs.length);
      const importDbResults: IContentImport = _.find(contentImportDB, { id: data.id }); // find import job in db
      importDbResults.importStatus = ImportStatus.completed // update status to completed in db
    }
    this.checkImportQueue()
  }

  public async pauseImport(importId: string) {
    const importDbResults: IContentImport = _.find(contentImportDB, { id: importId }); // find import job in db
    if (!importDbResults || _.includes([ImportStatus.canceled, ImportStatus.completed, ImportStatus.failed], importDbResults.importStatus)) {
      throw "INVALID_OPERATION"
    }
    if (importDbResults.importStatus === ImportStatus.inProgress) {
      const inProgressJob: IRunningImportJobs = _.find(this.runningImportJobs, { id: importId }); // running/in-progress job
      if (!inProgressJob) {
        throw "INVALID_OPERATION"
      }
      await inProgressJob.jobReference.pause();
      _.remove(this.runningImportJobs, job => job.id === inProgressJob.id) // update meta data in db 
    }
    importDbResults.importStatus = ImportStatus.paused; // update db with new status
    this.checkImportQueue();
  }

  public async resumeImport(importId: string) {
    const importDbResults: IContentImport = _.find(contentImportDB, { id: importId }); // find import job in db
    if (!importDbResults || !_.includes([ImportStatus.paused], importDbResults.importStatus)) {
      throw "INVALID_OPERATION"
    }
    importDbResults.importStatus = ImportStatus.resume; // update db with new status
    this.checkImportQueue();
  }

  public async cancelImport(importId: string) {
    const importDbResults: IContentImport = _.find(contentImportDB, { id: importId }); // find import job in db
    if (!importDbResults || _.includes([ImportStatus.canceled, ImportStatus.completed, ImportStatus.failed], importDbResults.importStatus)) {
      throw "INVALID_OPERATION"
    }
    if (importDbResults.importStatus === ImportStatus.inProgress) {
      const inProgressJob: IRunningImportJobs = _.find(this.runningImportJobs, { id: importId }); // running/in-progress job
      if (!inProgressJob) {
        throw "INVALID_OPERATION"
      }
      await inProgressJob.jobReference.cancel();
      _.remove(this.runningImportJobs, job => job.id === inProgressJob.id)
    }
    importDbResults.importStatus = ImportStatus.canceled; // update db with new status
    this.checkImportQueue();
  }

  private async getUnregisteredEcars(ecarPaths: Array<string>): Promise<Array<string>> {
    const registeredEcars = contentImportDB; // get all status of jobs from db except completed or failed
    ecarPaths = _.filter(ecarPaths, ecarPath => {
      if (_.find(registeredEcars, { ecarSourcePath: ecarPath })) {
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
  id: string;
  jobReference: ImportEcar
}
class ImportEcar {

  workerProcessRef: childProcess.ChildProcess;
  contentManifest: any;
  manifest: IContentManifest;

  constructor(private contentImportData: IContentImport, private cb) { 
    this.workerProcessRef = childProcess.fork('./contentImportHelper');
    this.handleChildProcessMessage();
    this.handleWorkerCloseEvents();
  }
  handleWorkerCloseEvents() {
    this.workerProcessRef.on('close', (data) => {
      console.log('------------------CHILD_PROCESS_CLOSE--------------------', data);
      if(!_.includes([ImportStatus.canceled, ImportStatus.paused], this.contentImportData.importStatus)){
        this.handleError("CHILD_PROCESS_CLOSE");
      }
    });
    this.workerProcessRef.on('exit', (code, signal) => {
      console.log('------------------CHILD_PROCESS_EXIT-------------------', code);
      if(!_.includes([ImportStatus.canceled, ImportStatus.paused], this.contentImportData.importStatus)){
        this.handleError("CHILD_PROCESS_EXIT");
      }
    });
  }
  async processContents(contentImportData?){
    try {
      if (contentImportData) {
        this.contentImportData = contentImportData;
        this.contentImportData.importStep = ImportSteps.processContents;
        await this.syncStatusToDb();
      }
      const contentIds = [this.contentImportData.id];
      if(this.contentImportData.childNodes){
        contentIds.push(...this.contentImportData.childNodes)
      }
      const dbContents = await this.getContentsFromDB(contentIds).catch(err => []);
      await this.saveContentsToDb(dbContents)
      this.cb(null, this.contentImportData);
    } catch (err) {
      this.cb('ERROR', this.contentImportData);
    }
  }
  private async saveContentsToDb(dbContents){
    let parent = _.get(this.contentImportData.manifest, 'archive.items[0]');
    let resources = [];
    parent.baseDir = `content/${parent.identifier}`;
    parent.desktopAppMetadata = {
      "addedUsing": 'IMPORT',// IAddedUsingType.import,
      "createdOn": Date.now(),
      "updatedOn": Date.now(),
    }
    if (this.contentImportData.contentType === 'application/vnd.ekstep.content-collection') {
    let itemsClone = _.cloneDeep(_.get(this.manifest, 'archive.items'));
    parent.children = this.createHierarchy(itemsClone, parent);
    resources = _.filter(_.get(this.manifest, 'archive.items'), item => (item.mimeType !== 'application/vnd.ekstep.content-collection'))
      .map(resource => {
        resource.baseDir = `content/${resource.identifier}`;
        resource.desktopAppMetadata = {
          "addedUsing": 'IMPORT',// IAddedUsingType.import,
          "createdOn": Date.now(),
          "updatedOn": Date.now(),
        }
        resource.appIcon = resource.appIcon ? `content/${resource.appIcon}` : resource.appIcon;
        return resource;
      });
    }
    // do bulk update of contents
  }
  async importComplete(contentImportData){
    try {
      if (contentImportData) {
        this.contentImportData = contentImportData;
        this.contentImportData.importStep = ImportSteps.complete;
        await this.syncStatusToDb();
      }
      // rename base content folder
      this.cb(null, this.contentImportData);
    } catch (err) {
      this.cb('ERROR', this.contentImportData);
    }
  }
  async handleChildProcessMessage() {
    this.workerProcessRef.on('message', async (data) => {
      console.log('Message from child process for importId:' + data.contentImportData.id, data.message);
      if (data.message === ImportSteps.copyEcar) {
        this.copyEcar()
      } else if (data.message === ImportSteps.parseEcar) {
        this.extractEcar(data.contentImportData)
      } else if (data.message === ImportSteps.extractEcar) {
        this.processContents(data.contentImportData)
      } else if(data.message === ImportSteps.complete) {
        this.importComplete(data.contentImportData)
      } else if (data.message === "DATA_SYNC_KILL") {
        this.handleKillSignal(data.contentImportData);
      } else if (data.message === 'IMPORT_ERROR') {
        this.handleError(data.message, data.contentImportData);
      } else {
        this.handleError('UNHANDLED_ERROR', data.contentImportData);
      }
    });
  }
  private async handleError(message, contentImportData?){
    console.error('Got error while importing ecar with download id:', this.contentImportData.id);
    if (contentImportData) {
      this.contentImportData = contentImportData;
      this.contentImportData.importStep = ImportSteps.extractEcar;
      await this.syncStatusToDb();
    }
    this.cb(message, this.contentImportData);
  }
  private async extractEcar(contentImportData?) {
    try {
      if (contentImportData) {
        this.contentImportData = contentImportData;
        this.contentImportData.importStep = ImportSteps.extractEcar;
        await this.syncStatusToDb();
      }
      const contentIds = [this.contentImportData.id];
      if(this.contentImportData.childNodes){
        contentIds.push(...this.contentImportData.childNodes)
      }
      const dbContents = await this.getContentsFromDB(contentIds).catch(err => []);
      this.workerProcessRef.send({
        message: this.contentImportData.importStep,
        contentImportData: this.contentImportData,
        dbContents
      });
    } catch (err) {
      this.cb('ERROR', this.contentImportData);
    }
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
        this.cb('UNHANDLED_ERROR', this.contentImportData);
        this.handleError('UNHANDLED_ERROR');
        break;
      }
    }
  }
  private async copyEcar(){
    this.contentImportData.importStep = ImportSteps.parseEcar
    await this.syncStatusToDb();
    this.workerProcessRef.send({
      message: this.contentImportData.importStep,
      contentImportData: this.contentImportData
    });
  }
  private async syncStatusToDb() {
    _.remove(contentImportDB, job => job.id === this.contentImportData.id) // update meta data in db 
    contentImportDB.push(this.contentImportData);

  }
  private async getContentsFromDB(contentIds: Array<string>) {
    return Promise.resolve([]);
  }
  async cancel() {
    console.log('cancel request');
    this.contentImportData.importStatus = ImportStatus.canceled
    this.workerProcessRef.send({ message: 'KILL' });
  }
  async pause() {
    console.log('pause import');
    this.contentImportData.importStatus = ImportStatus.paused
    this.workerProcessRef.send({ message: 'KILL' });
  }
  async handleKillSignal(contentImportData){
    this.workerProcessRef.kill();
    console.log('kill signal from child', this.contentImportData.importStatus, this.contentImportData.importStep);
    if(this.contentImportData.importStatus === ImportStatus.paused){
      this.contentImportData = contentImportData;
      this.contentImportData.importStatus = ImportStatus.paused
      await this.syncStatusToDb();
    } else {
      // clear all content and ecar folders
    }
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
process.on('unhandledRejection', err => {
  console.log('unhandledRejection', err);
});

process.on('uncaughtException', function (err) {
  console.log('uncaughtException caught in contentImportManager', err);
})
