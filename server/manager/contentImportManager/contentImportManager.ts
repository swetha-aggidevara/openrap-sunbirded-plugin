import * as fs from "fs";
import * as  _ from "lodash";
import * as os from "os";
import * as path from "path";
import * as uuid from "uuid";
import { handelError, IContentImport, ImportStatus, ImportSteps } from "./IContentImport";
import DatabaseSDK from "./../../sdk/database";
import { logger } from "@project-sunbird/ext-framework-server/logger";
import { containerAPI } from "OpenRAP/dist/api";
import { manifest } from "../../manifest";
import { IAddedUsingType } from "../../controllers/content/IContent";
import { TelemetryHelper } from "../../helper";
import { ImportContent } from "./contentImport";
import { Inject } from "typescript-ioc";
const telemetryEnv = "Content";
const telemetryInstance = containerAPI.getTelemetrySDKInstance().getInstance();
logger.info("System is running on", os.cpus().length, "cpus");
const maxRunningImportJobs = 1 || os.cpus().length;
const DEFAULT_IMPORT_CHECK_STATUS = [ImportStatus.reconcile, ImportStatus.resume, ImportStatus.inQueue];
export class ContentImportManager {

  @Inject private dbSDK: DatabaseSDK;
  @Inject private telemetryHelper: TelemetryHelper;
  private runningImportJobs: IRunningImportJobs[] = [];
  public async initialize(pluginId, contentFilesPath, downloadsFolderPath) {
    this.dbSDK.initialize(manifest.id);
  }
  /*
  method to reconcile import which dint complete when app was closed last time
  */
  public async reconcile() {
    const inProgressJob = await this.dbSDK.find("content_manager", { // TODO:Query needs to be optimized
      selector: {
        type: IAddedUsingType.import,
        status: {
          $in: [ImportStatus.inProgress],
        },
      },
    }).catch((err) => {
      logger.log("reconcile error while fetching inProgress content from DB", err.message);
      return { docs: [] };
    });
    logger.info("length of inProgress jobs found while reconcile", inProgressJob.docs.length);
    if (inProgressJob.docs.length) {
      const updateQuery: IContentImport[] = _.map(inProgressJob.docs, (job: IContentImport) => {
        job.status = ImportStatus.reconcile;
        return job;
      });
      await this.dbSDK.bulk("content_manager", updateQuery)
        .catch((err) => logger.log("reconcile error while updating status to DB", err.message));
    }
    this.checkImportQueue();
  }

  public async registerImportJob(ecarPaths: string[]): Promise<string[]> {
    logger.info("registerImportJob started for ", ecarPaths);
    ecarPaths = await this.getUnregisteredEcars(ecarPaths);
    logger.info("Unregistered Ecars:", ecarPaths);
    if (!ecarPaths || !ecarPaths.length) {
      throw {
        errCode: "ECARS_ADDED_ALREADY",
        errMessage: "All ecar are added to content manager",
      };
    }
    const dbData: IContentImport[] = [];
    for (const ecarPath of ecarPaths) {
      const contentSize = await this.getEcarSize(ecarPath).catch(handelError("ECAR_NOT_EXIST"));
      const insertData = {
        _id: uuid(),
        type: IAddedUsingType.import,
        name: path.basename(ecarPath),
        status: ImportStatus.inQueue,
        contentSize,
        createdOn: Date.now(),
        updatedOn: Date.now(),
        ecarSourcePath: ecarPath,
        importStep: ImportSteps.copyEcar,
        progress: 0,
        extractedEcarEntries: {},
        artifactUnzipped: {},
      };
      dbData.push(insertData);
      this.logSubmitAuditEvent(insertData._id, insertData.name, Object.keys(insertData));
    }
    await this.dbSDK.bulk("content_manager", dbData);
    this.checkImportQueue();
    return dbData.map((data) => data._id);
  }

  public async pauseImport(importId: string) {
    const importDbResults: IContentImport = await this.dbSDK.get("content_manager", importId)
      .catch((err) => logger.error("pauseImport error while fetching job details for ", importId));
    if (!importDbResults || _.includes([ImportStatus.canceled, ImportStatus.completed, ImportStatus.failed,
    ImportStatus.pausing, ImportStatus.canceling], importDbResults.status)) {
      throw "INVALID_OPERATION";
    }
    this.logAuditEvent(importDbResults, ImportStatus[ImportStatus.paused], ImportStatus[importDbResults.status]);
    if (importDbResults.status === ImportStatus.inProgress) {
      const inProgressJob: IRunningImportJobs = _.find(this.runningImportJobs, { _id: importId });
      if (!inProgressJob) {
        throw "INVALID_OPERATION";
      }
      await inProgressJob.jobReference.pause();
      _.remove(this.runningImportJobs, (job) => job._id === inProgressJob._id); // update meta data in db
    } else {
      importDbResults.status = ImportStatus.paused; // update db with new status
      await this.dbSDK.update("content_manager", importId, importDbResults)
        .catch((err) => logger.error("pauseImport error while updating job details for ", importId));
    }
    this.checkImportQueue();
  }

  public async resumeImport(importId: string) {
    const importDbResults: IContentImport = await this.dbSDK.get("content_manager", importId)
      .catch((err) => logger.error("resumeImport error while fetching job details for ", importId));
    if (!importDbResults || !_.includes([ImportStatus.paused], importDbResults.status)) {
      throw "INVALID_OPERATION";
    }
    this.logAuditEvent(importDbResults, ImportStatus[ImportStatus.resume], ImportStatus[importDbResults.status]);
    importDbResults.status = ImportStatus.resume;
    await this.dbSDK.update("content_manager", importId, importDbResults)
      .catch((err) => logger.error("resumeImport error while updating job details for ", importId));
    this.checkImportQueue();
  }

  public async cancelImport(importId: string) {
    const importDbResults: IContentImport = await this.dbSDK.get("content_manager", importId)
      .catch((err) => logger.error("cancelImport error while fetching job details for ", importId));
    if (!importDbResults || _.includes([ImportStatus.canceled, ImportStatus.canceling,
    ImportStatus.completed, ImportStatus.failed], importDbResults.status)) {
      throw "INVALID_OPERATION";
    }
    this.logAuditEvent(importDbResults, ImportStatus[ImportStatus.canceled], ImportStatus[importDbResults.status]);
    if (importDbResults.status === ImportStatus.inProgress) {
      const inProgressJob: IRunningImportJobs = _.find(this.runningImportJobs, { _id: importId });
      if (!inProgressJob) {
        throw "INVALID_OPERATION";
      }
      await inProgressJob.jobReference.cancel();
      _.remove(this.runningImportJobs, (job) => job._id === inProgressJob._id);
    } else {
      importDbResults.status = ImportStatus.canceled;
      const jobReference = new ImportContent(importDbResults, () => logger.log("cleanup"));
      jobReference.cleanUpAfterErrorOrCancel();
      await this.dbSDK.update("content_manager", importId, importDbResults)
        .catch((err) => logger.error("cancelImport error while updating job details for ", importId));
    }
    this.checkImportQueue();
  }

  public async retryImport(importId: string) {
    const importDbResults: IContentImport = await this.dbSDK.get("content_manager", importId)
      .catch((err) => logger.error("retryImport error while fetching job details for ", importId));
    if (!importDbResults || !_.includes([ImportStatus.failed], importDbResults.status)) {
      throw "INVALID_OPERATION";
    }
    this.logAuditEvent(importDbResults, ImportStatus[ImportStatus.resume], ImportStatus[importDbResults.status]);
    importDbResults.status = ImportStatus.inQueue;
    await this.dbSDK.update("content_manager", importId, importDbResults)
      .catch((err) => logger.error("retryImport error while updating job details for ", importId));
    this.checkImportQueue();
  }

  private getEcarSize(filePath): Promise<number> {
    return new Promise((resolve, reject) => {
      fs.stat(filePath, (err, stats) => {
        if (err) {
          return reject(err);
        }
        resolve(stats.size);
      });
    });
  }

  private async constructShareEvent(data) {
    const telemetryShareItems = [{
      id: _.get(data, "contentId"),
      type: _.get(data, "contentType"),
      ver: _.toString(_.get(data, "pkgVersion")),
      origin: {
        id: await containerAPI.getSystemSDKInstance(manifest.id).getDeviceId(),
        type: "Device",
      },
    }];
    this.telemetryHelper.logShareEvent(telemetryShareItems, "In");
  }

  private logSubmitAuditEvent(id, filePath, props) {
    const telemetryEvent = {
      context: {
        env: telemetryEnv,
        cdata: [{
          id: filePath,
          type: "fileName",
        }, {
          id,
          type: "importId",
        }],
      },
      edata: {
        state: ImportStatus[ImportStatus.inQueue], props,
      },
    };
    telemetryInstance.audit(telemetryEvent);
  }

  private async checkImportQueue(status: ImportStatus[] = DEFAULT_IMPORT_CHECK_STATUS) {
    const dbResponse = await this.dbSDK.find("content_manager", { // TODO:Query needs to be optimized
      selector: {
        type: IAddedUsingType.import,
        createdOn: {
          $gt: null,
        },
        status: {
          $in: status,
        },
      },
      sort: ["status"],
    }).catch((err) => {
      logger.log("Error while fetching queued jobs", err);
      return { docs: [] };
    });
    if (this.runningImportJobs.length >= maxRunningImportJobs) {
      logger.debug("no slot available to import, exiting");
      return;
    }
    logger.info("-------------list of queued jobs-------------", dbResponse);
    const queuedJobs: IContentImport[] = dbResponse.docs;
    if (!queuedJobs.length) {
      logger.debug("no queued jobs in db, exiting");
      return;
    }
    logger.info("entering while loop", this.runningImportJobs.length, queuedJobs.length);
    let queuedJobIndex = 0;
    while (maxRunningImportJobs > this.runningImportJobs.length && queuedJobs[queuedJobIndex]) {
      logger.info("in while loop", queuedJobs[queuedJobIndex], this.runningImportJobs.length);
      const jobRunning: any = _.find(this.runningImportJobs, { id: queuedJobs[queuedJobIndex]._id }); // duplicate check
      if (!jobRunning) {
        this.logAuditEvent(queuedJobs[queuedJobIndex], ImportStatus[ImportStatus.inProgress],
          ImportStatus[queuedJobs[queuedJobIndex].status]);
        const jobReference = new ImportContent(queuedJobs[queuedJobIndex], this.importJobCompletionCb.bind(this));
        jobReference.startImport();
        this.runningImportJobs.push({
          _id: queuedJobs[queuedJobIndex]._id,
          jobReference,
        });
      }
      queuedJobIndex++;
    }
    logger.info("exited while loop", queuedJobIndex, this.runningImportJobs.length);
  }

  private logAuditEvent(contentImport: IContentImport, state, prevstate) {
    const telemetryEvent: any = {
      context: {
        env: telemetryEnv,
        cdata: [{
          id: contentImport.name,
          type: "fileName",
        }, {
          id: contentImport._id,
          type: "importId",
        }],
      },
      edata: {
        state,
        prevstate,
        props: ["status", "updatedOn"],
        duration: (Date.now() - contentImport.updatedOn) / 1000,
      },
    };
    if (contentImport.contentId) {
      telemetryEvent.object = {
        id: contentImport.contentId,
        type: "content",
        ver: contentImport.pkgVersion,
      };
    }
    telemetryInstance.audit(telemetryEvent);
  }

  private async importJobCompletionCb(err: any, data: IContentImport) {
    _.remove(this.runningImportJobs, (job) => job._id === data._id);
    if (err) {
      this.logAuditEvent(data, ImportStatus[ImportStatus.failed], ImportStatus[ImportStatus.inProgress]);
      logger.error("Import job failed for", data._id, " with err", err);
    } else {
      // Adding telemetry share event
      this.constructShareEvent(data);

      this.logAuditEvent(data, ImportStatus[ImportStatus.completed], ImportStatus[ImportStatus.inProgress]);
      logger.log("Import job completed for", data._id);
    }
    this.checkImportQueue();
  }

  private async getUnregisteredEcars(ecarPaths: string[]): Promise<string[]> {
    const registeredEcars = await this.dbSDK.find("content_manager", {
      selector: {
        type: IAddedUsingType.import,
        status: {
          $in: [ImportStatus.inProgress, ImportStatus.inQueue, ImportStatus.reconcile,
          ImportStatus.resume, ImportStatus.paused, ImportStatus.pausing],
        },
      },
    });
    ecarPaths = _.filter(ecarPaths, (ecarPath) => {
      if (_.find(registeredEcars.docs, { ecarSourcePath: ecarPath })) {
        logger.log("skipping import for ", ecarPath, " as its already registered");
        return false;
      } else {
        return true;
      }
    });
    return ecarPaths;
  }
}
interface IRunningImportJobs {
  _id: string;
  jobReference: ImportContent;
}
