import * as childProcess from "child_process";
import { Inject } from "typescript-ioc";
import * as path from "path";
import DatabaseSDK from "../../sdk/database";
import { logger } from "@project-sunbird/ext-framework-server/logger";
import { manifest } from "../../manifest";
import * as  _ from "lodash";
import { Observer } from "rxjs";
import { containerAPI, ISystemQueueInstance, ITaskExecuter,  ISystemQueue, SystemQueueReq, SystemQueueStatus } from "OpenRAP/dist/api";

export class ContentDownloader implements ITaskExecuter {
  public static taskType = "DOWNLOAD";
  public static group = "CONTENT_MANAGER";
  private contentDownloadData: ISystemQueue;
  private observer;
  public async start(contentDownloadData: ISystemQueue, observer: Observer<ISystemQueue>) {
    this.contentDownloadData = contentDownloadData;
    this.observer = observer;
    logger.debug("ContentDownload executer called", this.contentDownloadData.name);
    return true;
  }
  public status(): ISystemQueue {
    return this.contentDownloadData;
  }
  public async pause() {
    return true;
  }
  public async resume(contentDownloadData: any) {
    return true;
  }
  public async cancel() {
    return true;
  }
  public async retry(contentDownloadData: any) {
    return true;
  }
}
