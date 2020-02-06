import * as fs from "fs";
import * as  _ from "lodash";
import { AutoWired, Inject, Singleton } from "typescript-ioc";
import * as path from "path";
import DatabaseSDK from "./../../sdk/database";
import { logger } from "@project-sunbird/ext-framework-server/logger";
import { containerAPI, ISystemQueueInstance, ISystemQueue, SystemQueueReq, SystemQueueStatus } from "OpenRAP/dist/api";
import { manifest } from "../../manifest";
import { ContentDownloader } from "./ContentDownloader";
import { HTTPService } from "@project-sunbird/ext-framework-server/services";
import Response from "../../utils/response";
const ContentReadUrl = `${process.env.APP_BASE_URL}/api/content/v1/read`;
const ContentSearchUrl = `${process.env.APP_BASE_URL}/api/content/v1/search`;
const DefaultRequestOptions = { headers: { "Content-Type": "application/json" } };
@Singleton
export class ContentDownloadManager {
  @Inject private dbSDK: DatabaseSDK;
  private systemQueue: ISystemQueueInstance;
  private systemSDK;
  public async initialize() {
    this.systemQueue = containerAPI.getSystemQueueInstance(manifest.id);
    this.systemQueue.register(ContentDownloader.taskType, ContentDownloader);
    this.dbSDK.initialize(manifest.id);
    this.systemSDK = containerAPI.getSystemSDKInstance(manifest.id);
  }
  public async download(req, res) {
    const contentId = req.params.id;
    const reqId = req.headers["X-msgid"];
    logger.debug(`${reqId} Content download request called for contentId: ${contentId}`);
    try {
      const contentResponse = await HTTPService.get(`${ContentReadUrl}/${req.params.id}`, {}).toPromise();
      const contentDetail = contentResponse.data.result.content;
      let contentSize = contentDetail.size;
      let contentToBeDownloadedCount = 1;
      const contentDownloadList = {
        [contentDetail.identifier]: {
          identifier: contentDetail.identifier,
          url: contentDetail.downloadUrl,
          size: contentDetail.size,
          downloaded: false,
          extracted: false,
          indexed: false,
        },
      };
      logger.debug(`${reqId} Content mimeType: ${contentDetail.mimeType}`);

      if (contentDetail.mimeType === "application/vnd.ekstep.content-collection") {
        logger.debug(`${reqId} Content childNodes: ${contentDetail.childNodes}`);
        const childNodeDetail = await this.getContentChildNodeDetails(contentDetail.childNodes);
        for (const content of childNodeDetail) {
          if (content.size && content.downloadUrl) {
            contentToBeDownloadedCount += 1;
            logger.debug(`${reqId} Content childNodes: ${content.identifier} added to list`);
            contentSize += content.size;
            contentDownloadList[content.identifier] = {
              identifier: content.identifier,
              url: content.downloadUrl,
              size: content.size,
              downloaded: false,
              extracted: false,
              indexed: false,
            };
          } else {
            logger.debug(`${reqId} Content childNodes: ${content.identifier} download skipped ${content.size}, ${content.downloadUrl}`);
          }
        }
      }
      await this.checkDiskSpaceAvailability(contentSize, true);
      const insertData: SystemQueueReq = {
        type: ContentDownloader.taskType,
        name: contentDetail.name,
        group: ContentDownloader.group,
        metaData: {
          contentToBeDownloadedCount,
          contentDownloadedCount: 0,
          downloadedSize: 0,
          contentSize,
          contentDownloadList,
          contentId,
          mimeType: contentDetail.mimeType,
          contentType: contentDetail.contentType,
          pkgVersion: contentDetail.pkgVersion,
        },
      };
      const id = await this.systemQueue.add(insertData);
      logger.debug(`${reqId} Content download request added to queue ${insertData}`);
      return res.send(Response.success("api.content.download", { downloadId: id }, req));
    } catch (error) {
      logger.error(`Content download request failed for contentId: ${contentId} with error: ${error.message}`);
      if (_.get(error, "code") === "LOW_DISK_SPACE") {
        res.status(507);
        return res.send(Response.error("api.content.download", 507, "Low disk space", "LOW_DISK_SPACE"));
      }
      res.status(500);
      return res.send(Response.error("api.content.download", 500));
    }
  }
  public async pause(req, res) {
    const downloadId = req.params.downloadId;
    const reqId = req.headers["X-msgid"];
    try {
      logger.debug(`${reqId} Content download pause request called for id: ${downloadId}`);
      await this.systemQueue.pause(downloadId);
      return res.send(Response.success("api.content.pause.download", downloadId, req));
    } catch (error) {
      logger.error(`${reqId} Content download pause request failed`, error.message);
      const status = _.get(error, "status") || 500;
      res.status(status);
      return res.send(Response.error("api.content.pause.download", status,
        _.get(error, "message"), _.get(error, "code")));
    }
  }

  public async resume(req, res) {
    const downloadId = req.params.downloadId;
    const reqId = req.headers["X-msgid"];
    try {
      logger.debug(`${reqId} Content download resume request called for id: ${downloadId}`);
      await this.systemQueue.resume(downloadId);
      return res.send(Response.success("api.content.resume.download", downloadId, req));
    } catch (error) {
      logger.error(`${reqId} Content download resume request failed`, error.message);
      const status = _.get(error, "status") || 500;
      res.status(status);
      return res.send( Response.error("api.content.resume.download", status, _.get(error, "message"), _.get(error, "code")));
    }
  }

  public async cancel(req, res) {
    const downloadId = req.params.downloadId;
    const reqId = req.headers["X-msgid"];
    try {
      logger.debug(`${reqId} Content download cancel request called for id: ${downloadId}`);
      await this.systemQueue.cancel(downloadId);
      return res.send(Response.success("api.content.pause.download", downloadId, req));
    } catch (error) {
      logger.error(`${reqId} Content download cancel request failed`, error.message);
      const status = _.get(error, "status") || 500;
      res.status(status);
      return res.send( Response.error("api.content.cancel.download", status, _.get(error, "message"), _.get(error, "code")));
    }
  }

  public async retry(req, res) {
    const downloadId = req.params.downloadId;
    const reqId = req.headers["X-msgid"];
    try {
      logger.debug(`${reqId} Content download retry request called for id: ${downloadId}`);
      await this.systemQueue.retry(downloadId);
      return res.send(Response.success("api.content.retry.download", downloadId, req));
    } catch (error) {
      logger.error(`${reqId} Content download retry request failed`, error.message);
      const status = _.get(error, "status") || 500;
      res.status(status);
      return res.send( Response.error("api.content.retry.download", status,
        _.get(error, "message"), _.get(error, "code")));
    }
  }

  private getContentChildNodeDetails(childNodes) {
    if (!childNodes || !childNodes.length) {
      return Promise.resolve([]);
    }
    const requestBody = {
      request: {
        filters: {
          identifier: childNodes,
          mimeType: { "!=": "application/vnd.ekstep.content-collection" },
        },
        limit: childNodes.length,
      },
    };
    return HTTPService.post(ContentSearchUrl, requestBody, DefaultRequestOptions).toPromise()
      .then((response) => _.get(response, "data.result.content") || []);
  }

  private async checkDiskSpaceAvailability(zipSize, collection) {
    const availableDiskSpace = await this.systemSDK.getHardDiskInfo()
      .then(({ availableHarddisk }) => availableHarddisk - 3e+8); // keeping buffer of 300 mb, this can be configured);
    if (!collection && (zipSize + (zipSize * 1.5) > availableDiskSpace)) {
      throw { message: "Disk space is low, couldn't copy Ecar", code: "LOW_DISK_SPACE" };
    } else if (zipSize * 1.5 > availableDiskSpace) {
      throw { message: "Disk space is low, couldn't copy Ecar", code: "LOW_DISK_SPACE" };
    }
  }
}
