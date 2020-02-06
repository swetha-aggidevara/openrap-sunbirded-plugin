import * as childProcess from "child_process";
import { Inject } from "typescript-ioc";
import * as path from "path";
import DatabaseSDK from "../../sdk/database";
import { logger } from "@project-sunbird/ext-framework-server/logger";
import { manifest } from "../../manifest";
import * as  _ from "lodash";
import { Observer } from "rxjs";
import { containerAPI, ISystemQueueInstance, ITaskExecuter, ISystemQueue, SystemQueueReq, SystemQueueStatus } from "OpenRAP/dist/api";
import { IDownloadMetadata } from "./IContentDownload";
import * as  StreamZip from "node-stream-zip";

export class ContentDownloader implements ITaskExecuter {
  public static taskType = "DOWNLOAD";
  public static group = "CONTENT_MANAGER";
  private contentDownloadData: ISystemQueue;
  @Inject private databaseSdk: DatabaseSDK;
  private downloadSDK = containerAPI.getDownloadSdkInstance();
  private observer: Observer<ISystemQueue>;
  private fileSDK = containerAPI.getFileSDKInstance(manifest.id);
  private systemSDK = containerAPI.getSystemSDKInstance(manifest.id);
  private contentDownloadMetaData: IDownloadMetadata;
  private ecarBasePath = this.fileSDK.getAbsPath("ecars");

  public async start(contentDownloadData: ISystemQueue, observer: Observer<ISystemQueue>) {
    this.databaseSdk.initialize(manifest.id);
    this.contentDownloadData = contentDownloadData;
    this.observer = observer;
    this.contentDownloadMetaData = this.contentDownloadData.metaData;
    logger.debug("ContentDownload executer start method called", this.contentDownloadData._id);
    _.forIn(this.contentDownloadMetaData.contentDownloadList, (value, key) => {
      this.downloadSDK.queueDownload(value.identifier, {
        url: value.url,
        savePath: path.join(this.ecarBasePath, value.identifier),
      }, this.getDownloadObserve(value.identifier));
    });
    return true;
  }

  public status(): ISystemQueue {
    return this.contentDownloadData;
  }
  public async pause() {
    logger.debug("ContentDownload executer pause method called", this.contentDownloadData._id);
    return true;
  }
  public async resume(contentDownloadData: any) {
    logger.debug("ContentDownload executer resume method called", this.contentDownloadData._id);
    return true;
  }
  public async cancel() {
    logger.debug("ContentDownload executer cancel method called", this.contentDownloadData._id);
    return true;
  }
  public async retry(contentDownloadData: any) {
    logger.debug("ContentDownload executer retry method called", this.contentDownloadData._id);
    return true;
  }
  private getDownloadObserve(contentId) {
    const next = (downloadProgress: IDownloadProgress) => {
      logger.debug(`${this.contentDownloadData._id}:Download progress event contentId: ${contentId}`, downloadProgress);
      if (downloadProgress.total) {
        this.updateProgress(contentId, downloadProgress);
      }
    };
    const error = (downloadError) => {
      logger.debug(`${this.contentDownloadData._id}:Download error event contentId: ${contentId},`, downloadError);
      this.handleErrorEvent(contentId, downloadError);
    };
    const complete = () => {
      logger.debug(`${this.contentDownloadData._id}:Download complete event contentId: ${contentId}`);
      this.updateDownloadedCount(contentId);
    };
    return { next, error, complete };
  }
  private handleErrorEvent(contentId, error) {
    logger.debug(`${this.contentDownloadData._id}:Download error event contentId: ${contentId},`, error);
  }
  private updateProgress(contentId: string, progress: IDownloadProgress) {
    const contentDetails = this.contentDownloadMetaData.contentDownloadList[contentId];
    const downloadedSize = this.contentDownloadMetaData.downloadedSize
      + (contentDetails.size * (progress.total.percentage / 100));
    this.contentDownloadData.progress = downloadedSize;
    this.observer.next(this.contentDownloadData);
  }
  private updateDownloadedCount(contentId) {
    try {
      const contentDetails = this.contentDownloadMetaData.contentDownloadList[contentId];
      contentDetails.downloaded = true;
      this.contentDownloadMetaData.contentDownloadedCount += 1;
      this.contentDownloadMetaData.downloadedSize += contentDetails.size;
      this.observer.next(this.contentDownloadData);
      this.extractContent(contentId);
      if (this.contentDownloadMetaData.contentDownloadedCount ===
        this.contentDownloadMetaData.contentToBeDownloadedCount) {
        logger.debug(`${this.contentDownloadData._id}: All contents downloaded`);
      } else {
        logger.debug(`${this.contentDownloadData._id}: Download status. Downloaded ${this.contentDownloadMetaData.contentDownloadedCount},
        Pending ${this.contentDownloadMetaData.contentToBeDownloadedCount - this.contentDownloadMetaData.contentDownloadedCount}`);
      }
    } catch (err) {
      logger.error(`${this.contentDownloadData._id}:error while processing download complete event: ${contentId}`,
        err.message);
    }
  }
  private async extractZipEntry(zipHandler, entry: string, distFolder): Promise<boolean | any> {
    return new Promise(async (resolve, reject) => zipHandler.extract(entry,
      distFolder, (err) => err ? reject(err) : resolve()));
  }
  private async extractContent(contentId) {
    const itemsToDelete = [];
    logger.debug(`${this.contentDownloadData._id}:Extracting content: ${contentId}`);
    const contentDetails = this.contentDownloadMetaData.contentDownloadList[contentId];
    const zipHandler: any = await this.loadZipHandler(path.join(this.ecarBasePath, contentDetails.identifier));
    await this.checkSpaceAvailability(path.join(this.ecarBasePath, contentDetails.identifier), zipHandler);
    const entries = zipHandler.entries();
    await this.fileSDK.mkdir(path.join("content", contentDetails.identifier));
    for (const entry of _.values(entries) as any) {
      await this.extractZipEntry(zipHandler, entry.name,
        path.join(this.fileSDK.getAbsPath("content"), contentDetails.identifier));
    }
    logger.debug(`${this.contentDownloadData._id}:Extracted content: ${contentId}`);
    itemsToDelete.push(path.join("ecars", contentDetails.identifier));
    const manifestJson = await this.fileSDK.readJSON(
      path.join(this.fileSDK.getAbsPath("content"), contentDetails.identifier, "manifest.json"));
    const metaData: any = _.get(manifestJson, "archive.items[0]");
    if (_.endsWith(metaData.artifactUrl, ".zip")) {
      await this.checkSpaceAvailability(path.join(this.fileSDK.getAbsPath("content"),
        contentDetails.identifier, path.basename(metaData.artifactUrl)));
      logger.debug(`${this.contentDownloadData._id}:Extracting artifact url content: ${contentId}`);
      await this.fileSDK.unzip(path.join("content", contentDetails.identifier, path.basename(metaData.artifactUrl)),
        path.join("content", contentDetails.identifier), false);
      itemsToDelete.push(path.join("content", contentDetails.identifier,  path.basename(metaData.artifactUrl)));
    }
    contentDetails.extracted = true;
    this.observer.next(this.contentDownloadData);
    for (const item of itemsToDelete) {
      await this.fileSDK.remove(item);
    }
    this.saveContentToDb(contentId, manifestJson, metaData);
  }
  private async saveContentToDb(contentId, manifestJson, metaData) {
    logger.debug(`${this.contentDownloadData._id}:Saving content: ${contentId} in database`);
    const contentDetails = this.contentDownloadMetaData.contentDownloadList[contentId];
    if (metaData.mimeType === "application/vnd.ekstep.content-collection") {
      metaData.children = this.createHierarchy(_.cloneDeep(_.get(manifestJson, "archive.items")), metaData);
    }
    metaData.baseDir = `content/${contentDetails.identifier}`;
    metaData.desktopAppMetadata = {
      "addedUsing": ContentDownloader.taskType,
      "createdOn": Date.now(),
      "updatedOn": Date.now(),
      "isAvailable": true,
    };
    if (contentId !== this.contentDownloadMetaData.contentId) {
      metaData.visibility = "Parent";
    }
    await this.databaseSdk.upsert("content", metaData.identifier, metaData);
    contentDetails.indexed = true;
    this.observer.next(this.contentDownloadData);
    this.checkForTaskCompletion();
  }
  private checkForTaskCompletion() {
    let totalContents = 0;
    let completedContents = 0;
    _.forIn(this.contentDownloadMetaData.contentDownloadList, (value, key) => {
      totalContents += 1;
      if (value.extracted) {
        completedContents += 1;
      }
    });
    if (totalContents === completedContents) {
      logger.debug(`${this.contentDownloadData._id}:download completed`);
      this.observer.complete();
    } else {
      logger.debug(`${this.contentDownloadData._id}:Extraction completed for ${completedContents},
      ${totalContents - completedContents}`);
    }
  }
  private async checkSpaceAvailability(zipPath, zipHandler?) {
    zipHandler = zipHandler || await this.loadZipHandler(zipPath);
    const entries = zipHandler.entries();
    const availableDiskSpace = await this.getAvailableDiskSpace();
    let contentSize = 0; // size in bytes
    for (const entry of _.values(entries) as any) {
      contentSize += entry.size;
    }
    if (contentSize > availableDiskSpace) {
      throw { message: "Disk space is low, couldn't extract Ecar", code: "LOW_DISK_SPACE" };
    }
  }
  private async loadZipHandler(filePath) {
    const zip = new StreamZip({ file: filePath, storeEntries: true, skipEntryNameValidation: true });
    return new Promise((resolve, reject) => {
      zip.on("ready", () => resolve(zip));
      zip.on("error", reject);
    });
  }
  private async getAvailableDiskSpace() {
    return this.systemSDK.getHardDiskInfo().then(({ availableHarddisk }) => {
      return availableHarddisk - 3e+8; // keeping buffer of 300 mb, this can be configured
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
interface IDownloadMetaData {
  url: string;
  savePath: string;
  sudPath: string;
  filesize: number;
  ranges: any[];
}

interface IDownloadProgress {
  time: { start: number, elapsed: number, eta: number };
  total: {
    filesize: number;
    downloaded: number;
    percentage: number;
  };
  instance: { downloaded: number; percentage: number };
  speed: number;
  avgSpeed: number;
  threadPositions: number[];
}
