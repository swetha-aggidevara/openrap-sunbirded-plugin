import { Inject } from "typescript-ioc";
import DatabaseSDK from "../../sdk/database";
import * as _ from 'lodash';
import Response from '../../utils/response';
import { Manifest } from "@project-sunbird/ext-framework-server/models";
import { logger } from '@project-sunbird/ext-framework-server/logger';
import { containerAPI } from "OpenRAP/dist/api";
import { HTTPService } from "@project-sunbird/ext-framework-server/services";
import { CONTENT_DOWNLOAD_STATUS } from './contentDownload';

let dbName = "content_download";
export default class ContentDownload {

    @Inject
    private databaseSdk: DatabaseSDK;
    private pluginId;

    constructor(manifest: Manifest) {
        this.databaseSdk.initialize(manifest.id);
        this.pluginId = manifest.id;
    }

    async contentUpdate(req: any, res: any) {
        try {
            let id = req.params.id;
            let parentId = _.get(req.body, 'request.parentId');
            const localContentData = await this.databaseSdk.get('content', id);
            let liveContentData = await HTTPService.get(`${process.env.APP_BASE_URL}/api/content/v1/read/${id}`, {}).toPromise();

            if (parentId && _.get(liveContentData, 'data.result.content.mimeType') !== "application/vnd.ekstep.content-collection" && _.get(liveContentData, 'data.result.content.pkgVersion') > localContentData.pkgVersion) {
                // Resource update inside collection
                logger.debug(`Resource Id inside collection = "${id}" for content update`);
                let a = await this.resourceInsideCollectionUpdate(parentId, liveContentData).then(data => { return res.send(Response.success('api.content.update', data)); });
                return a;
            }
            else if (_.get(liveContentData, 'data.result.content.mimeType') === "application/vnd.ekstep.content-collection" && _.get(liveContentData, 'data.result.content.pkgVersion') > localContentData.pkgVersion) {

                // Todo collection update
                logger.debug(`Collection Id = "${id}" for content update`);

            }
            else if (_.get(liveContentData, 'data.result.content.mimeType') !== "application/vnd.ekstep.content-collection" && _.get(liveContentData, 'data.result.content.pkgVersion') > localContentData.pkgVersion) {
                // Resource update
                logger.debug(`Resource Id = "${id}" for content update`);
                let a = await this.resourceUpdate(liveContentData).then(data => { return res.send(Response.success('api.content.update', data)); });
                return a;
            }
            else {
                logger.error(`ReqId = "${req.headers['X-msgid']}": Received error while processing content update for content ${req.params.id}`);
                res.status(500);
                return res.send(Response.error("api.content.update", 500));
            }
        } catch (error) {
            let status = error.status ? error.status : 500;
            res.status(status);
            return res.send(Response.error("api.content.update", status, error.message));
        }
    }

    resourceInsideCollectionUpdate(parentId, liveContentData) {
        return new Promise(async (resolve, reject) => {
            try {
                let downloadManager = containerAPI.getDownloadManagerInstance(this.pluginId);
                let parentContentData = await HTTPService.get(`${process.env.APP_BASE_URL}/api/content/v1/read/${parentId}`, {}).toPromise();
                        let downloadFiles = [{
                            id: (_.get(liveContentData, "data.result.content.identifier") as string),
                            url: (_.get(liveContentData, "data.result.content.downloadUrl") as string),
                            size: (_.get(liveContentData, "data.result.content.size") as number)
                        }];
                        let downloadId = await downloadManager.download(downloadFiles, 'ecars');
                        let queueMetaData = {
                            mimeType: _.get(parentContentData, 'data.result.content.mimeType'),
                            items: downloadFiles,
                            pkgVersion: _.get(parentContentData, 'data.result.content.pkgVersion'),
                            contentType: _.get(parentContentData, 'data.result.content.contentType'),
                        }
                        logger.debug(`insert to the content_download for content update`);
                        await this.databaseSdk.insert(dbName, {
                            downloadId: downloadId,
                            contentId: _.get(parentContentData, "data.result.content.identifier"),
                            name: _.get(parentContentData, "data.result.content.name"),
                            status: CONTENT_DOWNLOAD_STATUS.Submitted,
                            queueMetaData: queueMetaData,
                            createdOn: Date.now(),
                            updatedOn: Date.now()
                        })
                        logger.info(`Resource inserted in database successfully for content update`);
                        resolve(downloadId);
            } catch (err) {
                reject(err);
            }
        })
    }

    resourceUpdate(liveContentData) {
        return new Promise(async (resolve, reject) => {
            try {
                let downloadManager = containerAPI.getDownloadManagerInstance(this.pluginId)
                let downloadFiles = [{
                    id: (_.get(liveContentData, "data.result.content.identifier") as string),
                    url: (_.get(liveContentData, "data.result.content.downloadUrl") as string),
                    size: (_.get(liveContentData, "data.result.content.size") as number)
                }];
                let downloadId = await downloadManager.download(downloadFiles, 'ecars');
                let queueMetaData = {
                    mimeType: _.get(liveContentData, 'data.result.content.mimeType'),
                    items: downloadFiles,
                    pkgVersion: _.get(liveContentData, 'data.result.content.pkgVersion'),
                    contentType: _.get(liveContentData, 'data.result.content.contentType'),
                }
                logger.debug(`Insert to the content_download for content update`);
                await this.databaseSdk.insert(dbName, {
                    downloadId: downloadId,
                    contentId: _.get(liveContentData, "data.result.content.identifier"),
                    name: _.get(liveContentData, "data.result.content.name"),
                    status: CONTENT_DOWNLOAD_STATUS.Submitted,
                    queueMetaData: queueMetaData,
                    createdOn: Date.now(),
                    updatedOn: Date.now()
                })
                logger.info(`Resource inserted in database successfully for content update`);
                resolve(downloadId);
            } catch (err) {
                reject(err);
            }
        })
    }
}