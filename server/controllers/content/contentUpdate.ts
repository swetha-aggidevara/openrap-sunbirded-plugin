import { Inject } from "typescript-ioc";
import DatabaseSDK from "../../sdk/database";
import * as _ from 'lodash';
import Response from '../../utils/response';
import { Manifest } from "@project-sunbird/ext-framework-server/models";
import { logger } from '@project-sunbird/ext-framework-server/logger';
import { containerAPI } from "OpenRAP/dist/api";
import { HTTPService } from "@project-sunbird/ext-framework-server/services";

export enum CONTENT_DOWNLOAD_STATUS {
    Submitted = "SUBMITTED",
    Completed = "COMPLETED",
    Extracted = "EXTRACTED",
    Indexed = "INDEXED",
    Failed = "FAILED"
}

let dbName = "content_download";
export default class ContentDownload {

    @Inject
    private databaseSdk: DatabaseSDK;
    private pluginId;

    constructor(manifest: Manifest) {
        this.databaseSdk.initialize(manifest.id);
        this.pluginId = manifest.id;
    }

    async contentUpdate(req: any, res: any): Promise<any> {
        try {
            let id = req.params.id;
            const localContentData = await this.databaseSdk.get('content', id).catch(error => {
                logger.error(`Received Error while getting content data from db for content updating where error = ${error}`);
                res.status(500);
                return res.send(Response.error("api.content.update", 500));
            });
            let liveContentData = await HTTPService.get(`${process.env.APP_BASE_URL}/api/content/v1/read/${req.params.id}`, {}).toPromise();
            if (_.get(liveContentData, 'data.result.content.mimeType') === "application/vnd.ekstep.content-collection" && _.get(liveContentData, 'data.result.content.pkgVersion') > localContentData.pkgVersion) {

                // Todo collection update
                logger.debug(`Collection Id = "${id}": for content update`);

            }
            else if (_.get(liveContentData, 'data.result.content.mimeType') !== "application/vnd.ekstep.content-collection" && _.get(liveContentData, 'data.result.content.pkgVersion') > localContentData.pkgVersion) {
                logger.debug(`Resource Id = "${id}": for content update`);
                await this.resourceUpdate(req, res, localContentData, liveContentData);
            }
            else {
                logger.error(`ReqId = "${req.headers['X-msgid']}": Received error while processing content update for content ${req.params.id}`);
                res.status(500)
                return res.send(Response.error("api.content.update", 500))
            }
        } catch (error) {
            res.status(500);
            return res.send(Response.error("api.content.update", 500));
        }
    }

    async resourceUpdate(req, res, localContentData, liveContentData) {
        let downloadManager = containerAPI.getDownloadManagerInstance(this.pluginId)
        let downloadFiles = [{
            id: (_.get(liveContentData, "data.result.content.identifier") as string),
            url: (_.get(liveContentData, "data.result.content.downloadUrl") as string),
            size: (_.get(liveContentData, "data.result.content.size") as number)
        }]
        let downloadId = await downloadManager.download(downloadFiles, 'ecars');
        let queueMetaData = {
            mimeType: _.get(liveContentData, 'data.result.content.mimeType'),
            items: downloadFiles,
            pkgVersion: _.get(liveContentData, 'data.result.content.pkgVersion'),
            contentType: _.get(liveContentData, 'data.result.content.contentType'),
        }
        logger.debug(`ReqId = "${req.headers['X-msgid']}": insert to the content_download for content update`);
        await this.databaseSdk.insert(dbName, {
            downloadId: downloadId,
            contentId: _.get(liveContentData, "data.result.content.identifier"),
            name: _.get(liveContentData, "data.result.content.name"),
            status: CONTENT_DOWNLOAD_STATUS.Submitted,
            queueMetaData: queueMetaData,
            createdOn: Date.now(),
            updatedOn: Date.now()
        })
        logger.info(`ReqId = "${req.headers['X-msgid']}": Resource inserted in database successfully for content update`);
        return res.send(Response.success("api.content.update", { downloadId }));
    }
}