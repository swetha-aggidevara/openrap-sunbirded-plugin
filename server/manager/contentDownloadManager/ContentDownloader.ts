import * as childProcess from "child_process";
import { Inject } from "typescript-ioc";
import * as path from "path";
import DatabaseSDK from "../../sdk/database";
import { logger } from "@project-sunbird/ext-framework-server/logger";
import { manifest } from "../../manifest";
import * as  _ from "lodash";
import { Observer } from "rxjs";
import { containerAPI, ISystemQueueInstance, ITaskExecuter,  ISystemQueue, SystemQueueReq, SystemQueueStatus } from "OpenRAP/dist/api";
import {IDownloadMetadata} from "./IContentDownload"
export class ContentDownloader implements ITaskExecuter {
  public static taskType = "DOWNLOAD";
  public static group = "CONTENT_MANAGER";
  private contentDownloadData: ISystemQueue;
  private downloadSDK = containerAPI.getDownloadSdkInstance();
  private observer: Observer<ISystemQueue>;
  private fileSDK = containerAPI.getFileSDKInstance(manifest.id);
  private contentDownloadMetaData: IDownloadMetadata;
  private ecarBasePath = this.fileSDK.getAbsPath("ecars");
  public async start(contentDownloadData: ISystemQueue, observer: Observer<ISystemQueue>) {
    this.contentDownloadData = contentDownloadData;
    this.observer = observer;
    this.contentDownloadMetaData = this.contentDownloadData.metaData;
    logger.debug("ContentDownload executer start method called", this.contentDownloadData._id);
    const parent = this.contentDownloadMetaData.contentDownloadList[this.contentDownloadMetaData.contentId];
    this.downloadSDK.queueDownload(parent.id, {
      url: parent.url,
      savePath: path.join(this.ecarBasePath, parent.id),
    }, this.getDownloadObserve(parent.id));
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
    const next = (downloadProgress) => {
      logger.debug(`${this.contentDownloadData._id}:Download progress event contentId: ${contentId}`, downloadProgress);
    };
    const error = (downloadError) => {
      logger.debug(`${this.contentDownloadData._id}:Download error event contentId: ${contentId},`, downloadError);
    };
    const complete = () => {
      logger.debug(`${this.contentDownloadData._id}:Download complete event contentId: ${contentId}`);
    };
    return { next, error, complete };
  }
}
