import * as  _ from 'lodash';
import * as uuid from 'uuid';
import * as childProcess from 'child_process';
import * as os from 'os';
import * as  fs from 'fs';
const contentFolder = "./content/";
const ecarFolder = "./ecar/";
console.info('System is running on', os.cpus().length, 'cpus');
const maxRunningImportJobs = 1 || os.cpus().length;
let contentImportDB: Array<IContentImport> = [];

enum ImportSteps {
  copyEcar = "COPY_ECAR",
  parseEcar = "PARSE_ECAR",
  processManifest = "PROCESS_MANIFEST",
  extractEcar = "EXTRACT_ECAR",
  processContent = "PROCESS_CONTENT",
  saveContent = "SAVE_CONTENT"
}

enum ImportStatus {
  inQueue = "IN_QUEUE",
  resume = "RESUME",
  inProgress = "IN_PROGRESS",
  paused = "PAUSED",
  completed = "COMPLETED",
  failed = "FAILED",
  canceled = "CANCELED",
  reconcile = "RECONCILE"
}

interface IRunningImportJobs {
  id: string;
  jobReference: ImportEcar
}

interface IContentImport {
  id: string;
  importStatus: ImportStatus;
  createdOn: string | number;
  ecarSourcePath: string;
  contentId?: string;
  contentType?: string;
  importStep?: ImportSteps;
  ecarContentEntries?: Object;
  extractedEntries?: Object;
  contentToBeAdded?: Object;
  contentToBeUpdated?: Object;
  failedReason?: string;
}

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
    if (_.includes([ImportStatus.canceled, ImportStatus.completed, ImportStatus.failed], importDbResults.importStatus)) {
      throw "INVALID_OPERATION"
    }
    if (importDbResults.importStatus === ImportStatus.inProgress) {
      const inProgressJob: IRunningImportJobs = _.find(this.runningImportJobs, { id: importId }); // running/in-progress job
      if (!inProgressJob) {
        throw "INVALID_OPERATION"
      }
      const data = await inProgressJob.jobReference.pause();
      _.remove(this.runningImportJobs, job => job.id === inProgressJob.id) // update meta data in db 
    }
    importDbResults.importStatus = ImportStatus.paused; // update db with new status
  }

  public async resumeImport(importId: string) {
    const importDbResults: IContentImport = _.find(contentImportDB, { id: importId }); // find import job in db
    if (!_.includes([ImportStatus.paused], importDbResults.importStatus)) {
      throw "INVALID_OPERATION"
    }
    importDbResults.importStatus = ImportStatus.resume; // update db with new status
    this.checkImportQueue();
  }

  public async cancelImport(importId: string) {
    const importDbResults: IContentImport = _.find(contentImportDB, { id: importId }); // find import job in db
    if (_.includes([ImportStatus.canceled, ImportStatus.completed, ImportStatus.failed], importDbResults.importStatus)) {
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
  }

  private async getUnregisteredEcars(ecarPaths: Array<string>): Promise<Array<string>> {
    const registeredEcars = contentImportDB; // get IN_QUEUE, IN_PROGRESS jobs from db
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

interface contentManifest {
  archive: {
    items: Array<any>;
  };
}

class ImportEcar {

  workerProcessRef: childProcess.ChildProcess;
  contentManifest: any;
  manifest: contentManifest;

  constructor(private contentImportData: IContentImport, private cb) { 
    this.workerProcessRef = childProcess.fork('./contentImportHelper');
    this.handleChildProcessMessage();
    this.handleWorkerCloseEvents();
  }

  handleWorkerCloseEvents() {
    this.workerProcessRef.on('close', (data) => {
      console.log('worker close signal', data);
    });
    this.workerProcessRef.on('exit', (code, signal) => {
      console.log('worker exited:', code, signal);
    });
  }
  processContents(contentImportData){
    this.cb(null, this.contentImportData);
  }
  async handleChildProcessMessage() {
    this.workerProcessRef.on('message', async (data) => {
      console.log('got message from child', data.message);
      if (data.message === ImportSteps.copyEcar) {
        this.copyEcar()
      } else if (data.message === ImportSteps.parseEcar) {
        this.processManifest(data.contentImportData)
      } else if (data.message === ImportSteps.extractEcar) {
        this.processContents(data.contentImportData)
      } else if (data.message === "DATA_SYNC_KILL") {
        this.contentImportData = data.contentImportData;
        this.workerProcessRef.kill();
        await this.updateStatusInDB();
      } else if (data.message === 'IMPORT_ERROR') {
        this.cb(data.message, this.contentImportData);
        console.log('handle error');
      } else {
        console.log('handle error');
        this.cb('UNHANDLED_ERROR', this.contentImportData);
      }
    });
  }
  private async copyEcar(){
    this.contentImportData.importStep = ImportSteps.parseEcar
    await this.updateStatusInDB();
    this.workerProcessRef.send({
      message: this.contentImportData.importStep || ImportSteps.parseEcar,
      contentImportData: this.contentImportData
    });
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
          message: this.contentImportData.importStep || ImportSteps.parseEcar,
          contentImportData: this.contentImportData
        });
        break;
      }
      case ImportSteps.processManifest: {
        this.processManifest()
        break;
      }
      default: {
        this.cb('UNHANDLED_ERROR', this.contentImportData);
        break;
      }
    }
  }

  async updateStatusInDB() {
    let importDbResults: IContentImport = _.find(contentImportDB, { id: this.contentImportData.id });
    importDbResults = { ...importDbResults, ...this.contentImportData };
  }


  private async processManifest(contentImportData?) {
    try {
      if (contentImportData) {
        this.contentImportData = contentImportData;
        this.contentImportData.importStep = ImportSteps.processManifest
        await this.updateStatusInDB();
      }
      this.manifest = JSON.parse(fs.readFileSync(contentFolder + '/' + this.contentImportData.id + '/manifest.json', 'utf8'));
      let parent = _.get(this.manifest, 'archive.items[0]');
      let resources = [];
      if (_.get(parent, 'visibility') !== 'Default') {
        throw 'INVALID_MANIFEST'
      }
      if (parent.compatibilityLevel > 1) { // config.get("CONTENT_COMPATIBILITY_LEVEL")
        throw `UNSUPPORTED_COMPATIBILITY_LEVEL`;
      }

      const dbContents = await this.getContentsFromDB([parent.identifier]).catch(err => []);
      if (dbContents && dbContents.length) {
        // TODO: if content already exist in app 
        // 1.check compatibility level 
        // 2.compatibility level of childNodes of collection if update available update content
        // 3.collection ecar has more content ecar that in app, add those missing content to app
        this.cb(null, this.contentImportData);
        return;
      }
      this.contentImportData.contentId = parent.identifier;
      this.contentImportData.contentType = parent.mimeType;
      if (this.contentImportData.contentType === 'application/vnd.ekstep.content-collection') {
        let itemsClone = _.cloneDeep(_.get(this.manifest, 'archive.items'));
        parent.children = this.createHierarchy(itemsClone, parent);
        parent.baseDir = `content/${parent.identifier}`;
        parent.desktopAppMetadata = {
          // "ecarFile": resource.identifier + '.ecar',  // relative to ecar folder
          "addedUsing": 'IMPORT',// IAddedUsingType.import,
          "createdOn": Date.now(),
          "updatedOn": Date.now(),
        }
        resources = _.filter(_.get(this.manifest, 'archive.items'), item => (item.mimeType !== 'application/vnd.ekstep.content-collection'))
          .map(resource => {
            resource.baseDir = `content/${resource.identifier}`;
            resource.desktopAppMetadata = {
              // "ecarFile": resource.identifier + '.ecar',  // relative to ecar folder
              "addedUsing": 'IMPORT',// IAddedUsingType.import,
              "createdOn": Date.now(),
              "updatedOn": Date.now(),
            }
            resource.appIcon = resource.appIcon ? `content/${resource.appIcon}` : resource.appIcon;
            return resource;
          });
      }
      this.contentImportData.importStep = ImportSteps.extractEcar;
      this.contentImportData.extractedEntries = { 'manifest.json': true }
      await this.updateStatusInDB();
      this.workerProcessRef.send({
        message: this.contentImportData.importStep,
        contentImportData: this.contentImportData
      });
      this.cb(null, this.contentImportData);
    } catch (err) {
      this.cb(null, this.contentImportData);
    }
  }
  private async getContentsFromDB(contentIds: Array<string>) {
    return Promise.resolve([]);
  }

  async resume() {
    console.log('resume content import');
    this.startImport()
  }

  async cancel() {
    console.log('killing child process inOrder to cancel import');
    // this.workerProcessRef.send({ message: 'KILL' });
    this.workerProcessRef.kill();
  }

  async pause() {
    console.log('pause import');
    this.workerProcessRef.send({ message: 'KILL' });
  }
  createHierarchy(items: any[], parent: any, reqID?: any, tree?: any[]): any {
    console.debug(`ReqId = "${reqID}": creating Hierarchy for the Collection`);
    console.info(` ReqId = "${reqID}": Getting child contents for Parent: ${_.get(parent, 'identifier')}`);
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
        _.each(children, (child) => { this.createHierarchy(items, child, reqID) });
      }
    }
    console.info(` ReqId = "${reqID}": Child contents are found for Parent: ${_.get(parent, 'identifier')}`);
    return tree;
  }
}
process.on('unhandledRejection', err => {
  console.log('unhandledRejection', err);
});

process.on('uncaughtException', function (err) {
  console.log('uncaughtException caught in contentImportManager', err);
})
