import * as  _ from 'lodash';
import * as uuid from 'uuid';
import * as childProcess from 'child_process';
import * as os from 'os';
console.info('System is running on', os.cpus().length, 'cpus');
const maxRunningImportJobs = 1 || os.cpus().length; 
let contentImportDB: Array<IContentImport> = [];

enum ImportSteps {
  loadManifest = "LOAD_MANIFEST",
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
  canceled = "CANCELED"
}

interface IRunningImportJobs {
  id: string;
  jobReference: ImportEcar
}

interface IContentImport {
  id: string;
  importStatus: ImportStatus;
  createdOn: string;
  ecarSourcePath: string;
  contentId?: string;
  importStep?: ImportSteps;
  importMetaData?: IImportMetaData;
}

interface IImportMetaData {
  ecarContentEntries: Object;
  contentToBeAdded: Object;
  contentToBeUpdated: Object;
}

export class ContentImportManager {

  private runningImportJobs: Array<IRunningImportJobs> = [];

  public async registerImportJob(ecarPaths: Array<string>): Promise<Array<string>> {
    console.log('import register job started for ', ecarPaths);
    ecarPaths = await this.getUnregisteredEcars(ecarPaths)
    console.log('after unique check', ecarPaths);
    if(!ecarPaths || !ecarPaths.length){
      console.log('no unique ecar found returning', ecarPaths);
      return [];
    }
    const dbData = _.map(ecarPaths, ecarPath => ({
      id: uuid(),
      importStatus: ImportStatus.inQueue,
      createdOn: Date.now(),
      ecarSourcePath: ecarPath,
      importMetaData: {}
    }))
    contentImportDB.push(...dbData); // insert to contentImport DB
    this.checkImportQueue();
    return dbData.map(data => data.id)
  }

  private async checkImportQueue(status: Array<ImportStatus> = [ImportStatus.inQueue, ImportStatus.resume]) {
    console.log('checkImportQueue method called', contentImportDB);
    if(this.runningImportJobs.length >= maxRunningImportJobs){
      console.log('no slot available to import, returning');
      return;
    }
    const queuedJobs = _.filter(contentImportDB, job => {
      return _.includes(status, job.importStatus)
    }) // get IN_QUEUE jobs from db
    console.log('list of queued jobs', queuedJobs);
    if(!queuedJobs.length){
      console.log('no queued jobs in db');
      return;
    }
    console.log('entering while loop', maxRunningImportJobs, this.runningImportJobs.length);
    let queuedJobIndex = 0;
    while(maxRunningImportJobs > this.runningImportJobs.length && queuedJobs[queuedJobIndex]){
      console.log('in while loop', queuedJobs[queuedJobIndex], this.runningImportJobs.length);
      this.runningImportJobs.push({
        id: queuedJobs[queuedJobIndex].id,
        jobReference: new ImportEcar(queuedJobs[queuedJobIndex], this.importJobCompletionCb.bind(this))
      })
      queuedJobIndex++
    }
    console.log('exited while loop', queuedJobIndex, this.runningImportJobs.length);
  }
  private importJobCompletionCb(err: any, data: IContentImport){
    if(err){
      console.log('error will importing content');
      return
    }
    console.log('completed import job',this.runningImportJobs.length, data);
    _.remove(this.runningImportJobs, job => job.id === data.id) // update meta data in db 
    console.log(this.runningImportJobs.length);
    const importDbResults: IContentImport = _.find(contentImportDB, { id: data.id}); // find import job in db
    importDbResults.importStatus = ImportStatus.completed // update status to completed in db
    this.checkImportQueue()
  }
  public async pauseImport(importId: string) {
    const importDbResults: IContentImport = _.find(contentImportDB, { id: importId}); // find import job in db
    if(_.includes([ImportStatus.canceled, ImportStatus.completed, ImportStatus.failed], importDbResults.importStatus)){
      throw "INVALID_OPERATION"
    }
    if(importDbResults.importStatus === ImportStatus.inProgress){
      const inProgressJob: IRunningImportJobs = _.find(this.runningImportJobs, { id: importId}); // running/in-progress job
      if(!inProgressJob){
        throw "INVALID_OPERATION"
      }
      const data = await inProgressJob.jobReference.pause();
      _.remove(this.runningImportJobs, job => job.id === inProgressJob.id) // update meta data in db 
    }
    importDbResults.importStatus = ImportStatus.paused; // update db with new status
  }
  public async resumeImport(importId: string) {
    const importDbResults: IContentImport = _.find(contentImportDB, { id: importId}); // find import job in db
    if(!_.includes([ImportStatus.paused], importDbResults.importStatus)){
      throw "INVALID_OPERATION"
    }
    importDbResults.importStatus = ImportStatus.resume; // update db with new status
    this.checkImportQueue();
  }
  public async cancelImport(importId: string){
    const importDbResults: IContentImport = _.find(contentImportDB, { id: importId}); // find import job in db
    if(_.includes([ImportStatus.canceled, ImportStatus.completed, ImportStatus.failed], importDbResults.importStatus)){
      throw "INVALID_OPERATION"
    }
    if(importDbResults.importStatus === ImportStatus.inProgress){
      const inProgressJob: IRunningImportJobs = _.find(this.runningImportJobs, { id: importId}); // running/in-progress job
      if(!inProgressJob){
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
      if(_.find(registeredEcars, { ecarSourcePath: ecarPath })){
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
  manifest: contentManifest = {
    archive: {
      items: []
    }
  }
  constructor(private contentImportData: IContentImport, private cb) {
    this.startImport()
  }
  startImport() {
    this.workerProcessRef = childProcess.fork('./contentImportHelper');
    this.handleChildProcessMessage();
    this.workerProcessRef.on('close', (data) => {
      console.log('worker close signal', data);
    });
    this.workerProcessRef.on('exit', (code, signal) => {
      console.log('worker exited:', code, signal);
    });
    console.log('sending message to child');
    this.workerProcessRef.send({
      message: 'IMPORT',
      ecarFileName: this.contentImportData.ecarSourcePath,
      ecarEntries: this.contentImportData.importMetaData.ecarContentEntries || {}
    });
  }
  copyEcar(ecarFilePath) {

  }

  handleChildProcessMessage() {
    this.workerProcessRef.on('message', (data) => {
      console.log('got message from child', data.message);
      if(data.message === "DATA_SYNC_KILL"){
        this.contentImportData.importMetaData.ecarContentEntries = data.ecarEntries
        this.workerProcessRef.kill();
      } else if(data.message === 'IMPORT_COMPLETE'){
        this.cb(null, this.contentImportData);
      }
    });
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
}
