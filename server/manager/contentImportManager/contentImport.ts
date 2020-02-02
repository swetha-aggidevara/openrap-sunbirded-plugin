import * as childProcess from "child_process";
import { IContentImport, ImportStatus, ImportSteps, ErrorObj } from "./IContentImport";
import { Inject } from "typescript-ioc";
import * as path from "path";
import DatabaseSDK from "../../sdk/database";
import { logger } from "@project-sunbird/ext-framework-server/logger";
import { containerAPI, ISystemQueue, ITaskExecuter } from "OpenRAP/dist/api";
import { manifest } from "../../manifest";
import { IAddedUsingType } from "../../controllers/content/IContent";
import * as  _ from "lodash";
import { Observer } from "rxjs";

export class ImportContent implements ITaskExecuter {
  public static taskType = "IMPORT";
  private workerProcessRef: childProcess.ChildProcess;
  private fileSDK: any;
  @Inject private dbSDK: DatabaseSDK;
  private manifestJson: any;
  private interrupt;
  private contentImportData: ISystemQueue;
  private observer: Observer<ISystemQueue>;
  constructor() {
    this.dbSDK.initialize(manifest.id);
    this.fileSDK = containerAPI.getFileSDKInstance(manifest.id);
  }
  public status() {
    return this.contentImportData;
  }
  public async start(contentImportData: ISystemQueue, observer: Observer<ISystemQueue>) {
    this.workerProcessRef = childProcess.fork(path.join(__dirname, "contentImportHelper"));
    this.handleChildProcessMessage();
    this.handleWorkerCloseEvents();
    this.contentImportData.progress = 0;
    await this.syncStatusToDb();
    switch (this.contentImportData.data.step) {
      case ImportSteps.copyEcar: {
        this.workerProcessRef.send({
          message: this.contentImportData.data.step,
          contentImportData: this.contentImportData,
        });
        break;
      }
      case ImportSteps.parseEcar: {
        this.workerProcessRef.send({
          message: this.contentImportData.data.step,
          contentImportData: this.contentImportData,
        });
        break;
      }
      case ImportSteps.extractEcar: {
        this.extractEcar();
        break;
      }
      case ImportSteps.processContents: {
        this.processContents();
        break;
      }
      default: {
        this.handleChildProcessError({ errCode: "UNHANDLED_IMPORT_STEP", errMessage: "unsupported import step" });
        break;
      }
    }
    return true;
  }

  public cleanUpAfterErrorOrCancel() {
    this.fileSDK.remove(path.join("ecars", this.contentImportData._id + ".ecar")).catch((err) => logger.debug(`Error while deleting file ${path.join("ecars", this.contentImportData._id + ".ecar")}`));
    this.fileSDK.remove(path.join("content", this.contentImportData._id)).catch((err) => logger.debug(`Error while deleting folder ${path.join("content", this.contentImportData._id)}`));
    // TODO: delete content folder if there"s no record in db;
  }

  public async cancel() {
    this.interrupt = true; // to stop message from child process
    logger.log("canceling running import job for", this.contentImportData._id);
    if (this.contentImportData.data.step === ImportSteps.processContents) {
      return false;
    }
    this.workerProcessRef.send({ message: "KILL" });
    this.cleanUpAfterErrorOrCancel();
    await this.handleKillSignal();
    return true;
  }

  public async pause() {
    logger.log("pausing running import job for", this.contentImportData._id);
    this.interrupt = true; // to stop message from child process
    if (this.contentImportData.data.step === ImportSteps.processContents) {
      return false;
    }
    this.workerProcessRef.send({ message: "KILL" });
    await this.handleKillSignal();
    return true;
  }

  /*
   * _id, _rev, ImportStep, ImportStatus should not be copied from child.
   * Parent will handle status update and import progress
  */
  private saveDataFromWorker(contentImportData: IContentImport) {
    this.contentImportData = {
      ...this.contentImportData,
      ..._.pick(contentImportData, ["childNodes", "contentId", "mimeType", "extractedEcarEntries", "artifactUnzipped", "progress", "contentSize", "pkgVersion", "contentSkipped", "contentAdded", "contentType"]),
    };
  }

  private async extractEcar() {
    try {
      if (this.contentImportData.data.step !== ImportSteps.extractEcar) {
        this.contentImportData.data.step = ImportSteps.extractEcar;
        await this.syncStatusToDb();
      }
      const contentIds = [this.contentImportData.data.contentId];
      if (this.contentImportData.data.childNodes) {
        contentIds.push(...this.contentImportData.data.childNodes);
      }
      const dbContents = await this.getContentsFromDB(contentIds);
      this.workerProcessRef.send({
        message: this.contentImportData.data.step,
        contentImportData: this.contentImportData,
        dbContents,
      });
    } catch (err) {
      logger.error(this.contentImportData._id, "Error while processContents ", err);
      await this.syncStatusToDb();
      this.observer.error(err);
      this.cleanUpAfterErrorOrCancel();
    }
  }

  private async processContents() {
    try {
      if (this.contentImportData.data.step !== ImportSteps.processContents) {
        this.contentImportData.data.step = ImportSteps.processContents;
        await this.syncStatusToDb();
      }
      const contentIds = [this.contentImportData.data.contentId];
      if (this.contentImportData.data.childNodes) {
        contentIds.push(...this.contentImportData.data.childNodes);
      }
      const dbContents = await this.getContentsFromDB(contentIds);
      await this.saveContentsToDb(dbContents);
      this.contentImportData.data.step = ImportSteps.complete;
      logger.info("--------import complete-------", JSON.stringify(this.contentImportData));
      await this.syncStatusToDb();
      this.observer.next(this.contentImportData);
      this.observer.complete();
    } catch (err) {
      logger.error(this.contentImportData._id, "Error while processContents for ", err);
      this.contentImportData.data.step = ImportSteps.copyEcar;
      this.contentImportData.failedCode = err.errCode || "CONTENT_SAVE_FAILED";
      this.contentImportData.failedReason = err.errMessage;
      await this.syncStatusToDb();
      this.observer.next(this.contentImportData);
      this.observer.error(err);
      this.cleanUpAfterErrorOrCancel();
    } finally {
      this.workerProcessRef.kill();
    }
  }

  private async saveContentsToDb(dbContents) {
    logger.info(this.contentImportData._id, "saving contents to db");
    this.manifestJson = await this.fileSDK.readJSON(
      path.join(path.join(this.fileSDK.getAbsPath("content"), this.contentImportData.data.contentId), "manifest.json"));
    const resources = _.reduce(_.get(this.manifestJson, "archive.items"), (acc, item) => {
      const parentContent = item.identifier === this.contentImportData.data.contentId;
      if (item.mimeType === "application/vnd.ekstep.content-collection" && !parentContent) {
        logger.info("Skipped writing to db for content", item.identifier, "reason: collection and not parent");
        return acc; // db entry not required for collection which are not parent
      }
      const dbResource: any = _.find(dbContents, { identifier: item.identifier });
      const isAvailable = parentContent ? true : _.includes(this.contentImportData.data.contentAdded, item.identifier);
      if ((dbResource && _.get(dbResource, "desktopAppMetadata.isAvailable") && !isAvailable)) {
        logger.info("Skipped writing to db for content", item.identifier, "reason: content already added to db and no changes required or artifact not present",
        parentContent, isAvailable, !dbResource);
        // content added with artifact already or added without artifact but ecar has no artifact for this content
        return acc; // then return
      }
      item._id = item.identifier;
      item.baseDir = `content/${item.identifier}`;
      item.desktopAppMetadata = {
        addedUsing: IAddedUsingType.import,
        createdOn: Date.now(),
        updatedOn: Date.now(),
        isAvailable,
      };
      if (dbResource) {
        item._rev = dbResource._rev;
        item.desktopAppMetadata.createdOn = dbResource.desktopAppMetadata.createdOn;
      }
      item.visibility = parentContent ? "Default" : item.visibility;
      if (parentContent && item.mimeType === "application/vnd.ekstep.content-collection") {
        const itemsClone = _.cloneDeep(_.get(this.manifestJson, "archive.items"));
        item.children = this.createHierarchy(itemsClone, item);
      }
      acc.push(item);
      logger.info("Writing to db for content", { id: item.identifier, parentContent, isAvailable,
        notInDb: !dbResource});
      return acc;
    }, []);
    if (!resources.length) {
      logger.info("Skipping bulk update for ImportId", this.contentImportData._id);
      return true;
    }
    await this.dbSDK.bulk("content", resources);
  }

  private async copyEcar() {
    this.contentImportData.data.step = ImportSteps.parseEcar;
    await this.syncStatusToDb();
    this.workerProcessRef.send({
      message: this.contentImportData.data.step,
      contentImportData: this.contentImportData,
    });
  }

  private async handleChildProcessMessage() {
    this.workerProcessRef.on("message", async (data) => {
      logger.log("Message from child process for importId:" + _.get(data, "contentImportData._id"), data.message);
      if (data.contentImportData && (data && data.message !== "LOG")) {
        this.saveDataFromWorker(data.contentImportData); // save only required data from child,
      }
      if (this.interrupt) { // stop import progress when status changes like pause or cancel
        return;
      }
      if (data.message === ImportSteps.copyEcar) {
        this.copyEcar();
      } else if (data.message === ImportSteps.parseEcar) {
        this.extractEcar();
      } else if (data.message === ImportSteps.extractEcar) {
        this.processContents();
      } else if (data.message === "DATA_SYNC") {
        this.syncStatusToDb();
      } else if (data.message === "LOG") {
        if (logger[data.logType]) {
          logger[data.logType]("Log from import worker: ", ...data.logBody);
        }
      } else if (data.message === "IMPORT_ERROR") {
        this.handleChildProcessError(data.err);
      } else {
        this.handleChildProcessError({ errCode: "UNHANDLED_WORKER_MESSAGE", errMessage: "unsupported import step" });
      }
    });
  }

  private handleWorkerCloseEvents() {
    this.workerProcessRef.on("exit", (code, signal) => {
      logger.log(this.contentImportData._id, "Child process exited with", code, signal);
      if (this.interrupt || this.contentImportData.data.step === ImportSteps.complete) {
        return;
      }
      if (!_.includes([ImportStatus.canceled, ImportStatus.paused], this.contentImportData.status)) {
        this.handleUnexpectedChildProcessExit(code, signal);
      }
    });
  }

  private async handleUnexpectedChildProcessExit(code, signal) {
    logger.error("Unexpected exit of child process for importId",
      this.contentImportData._id, "with signal and code", code, signal);
    this.contentImportData.status = ImportStatus.failed; // this line should not be removed
    this.contentImportData.data.step = ImportSteps.copyEcar;
    this.contentImportData.failedCode = "WORKER_UNHANDLED_EXCEPTION";
    this.contentImportData.failedReason = "Import Worker exited while processing ECar";
    await this.syncStatusToDb();
    this.cleanUpAfterErrorOrCancel();
  }

  private async handleChildProcessError(err: ErrorObj) {
    logger.error(this.contentImportData._id, "Got error while importing ecar with importId:", err);
    this.contentImportData.data.step = ImportSteps.copyEcar;
    this.contentImportData.failedCode = err.errCode;
    this.contentImportData.failedReason = err.errMessage;
    this.contentImportData.status = ImportStatus.failed;
    await this.syncStatusToDb();
    this.cb(err, this.contentImportData);
    this.cleanUpAfterErrorOrCancel();
  }

  // TODO: Revision and compaction to be handled
  private async syncStatusToDb() {
    this.observer.next(this.contentImportData);
  }

  private async getContentsFromDB(contentIds: string[]) {
    const dbResults = await this.dbSDK.find("content", {
      selector: {
        identifier: {
          $in: contentIds,
        },
      },
    }).catch((err) => undefined);
    return _.get(dbResults, "docs") ? dbResults.docs : [];
  }

  private async handleKillSignal() {
    return new Promise((resolve, reject) => {
      this.workerProcessRef.on("message", async (data) => {
        if (data.message === "DATA_SYNC_KILL") {
          this.workerProcessRef.kill();
          logger.log(this.contentImportData._id, "kill signal from child",
            this.contentImportData.status, this.contentImportData.data.step);
          if (this.contentImportData.status === ImportStatus.paused) {
            this.contentImportData.status = ImportStatus.paused; // this line should not be removed
          } else if (this.contentImportData.status === ImportStatus.canceled) {
            this.contentImportData.status = ImportStatus.canceled; // this line should not be removed
            this.cleanUpAfterErrorOrCancel();
          }
          await this.syncStatusToDb();
          resolve();
        }
      });
    });
  }

  private createHierarchy(items: any[], parent: any, tree?: any[]): any {
    tree = typeof tree !== "undefined" ? tree : [];
    parent = typeof parent !== "undefined" ? parent : { visibility: "Default" };
    if (parent.children && parent.children.length) {
      let children = [];
      _.forEach(items, (child) => {
        const childWithIndex: any = _.find(parent.children, { identifier: child.identifier });
        if (!_.isEmpty(childWithIndex)) {
          child.index = childWithIndex.index;
          children.push(child);
        }
      });
      if (!_.isEmpty(children)) {
        children = _.sortBy(children, "index");
        if (parent.visibility === "Default") {
          tree = children;
        } else {
          parent.children = children;
        }
        _.each(children, (child) => this.createHierarchy(items, child));
      }
    }
    return tree;
  }
}
