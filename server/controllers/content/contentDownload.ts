import { Inject } from "typescript-ioc";
import DatabaseSDK from "../../sdk/database";
import * as _ from 'lodash';
import config from "../../config";
import Response from '../../utils/response';
import { Manifest } from "@project-sunbird/ext-framework-server/models";
import * as fs from 'fs';
import { logger } from '@project-sunbird/ext-framework-server/logger';
import * as path from 'path';
import * as uuid from 'uuid';
import Hashids from 'hashids';
import { containerAPI } from "OpenRAP/dist/api";
import { HTTPService } from "@project-sunbird/ext-framework-server/services";

export enum CONTENT_DOWNLOAD_STATUS {
    Submitted = "SUBMITTED",
    Completed = "COMPLETED",
    Extracted = "EXTRACTED",
    Indexed = "INDEXED"
}

export default class ContentDownload {

    private contentsFilesPath: string = 'content';
    private ecarsFolderPath: string = 'ecars';

    @Inject
    private databaseSdk: DatabaseSDK;

    private fileSDK;
    private pluginId;

    constructor(manifest: Manifest) {
        this.databaseSdk.initialize(manifest.id);
        this.fileSDK = containerAPI.getFileSDKInstance(manifest.id);
        this.pluginId = manifest.id;
    }

    download(req: any, res: any): any {
        (async () => {
            try {
                // get the content using content read api
                let content = await HTTPService.get(`${process.env.APP_BASE_URL}/api/content/v1/read/${req.params.id}`, {}).toPromise()
                if (_.get(content, 'data.result.content.mimeType')) {
                    let downloadManager = containerAPI.getDownloadManagerInstance(this.pluginId)
                    // check if the content is type collection
                    if (_.get(content, 'data.result.content.mimeType') !== "application/vnd.ekstep.content-collection") {

                        // insert to the to content_download_queue
                        // add the content to queue using downloadManager

                        let downloadId = await downloadManager.download({
                            id: (_.get(content, "data.result.content.identifier") as string),
                            url: (_.get(content, "data.result.content.downloadUrl") as string),
                            size: (_.get(content, "data.result.content.size") as number)
                        }, 'ecars')
                        await this.databaseSdk.insert("content_download", {
                            downloadId: downloadId,
                            contentId: _.get(content, "data.result.content.identifier"),
                            name: _.get(content, "data.result.content.name"),
                            status: CONTENT_DOWNLOAD_STATUS.Submitted,
                            metadata: _.get(content, 'data.result.content'),
                            createdOn: Date.now(),
                            updatedOn: Date.now()
                        })
                        return res.send(Response.success("api.content.read", { downloadId }));
                        // return response the downloadId
                    } else {

                        let downloadFiles = [{
                            id: (_.get(content, "data.result.content.identifier") as string),
                            url: (_.get(content, "data.result.content.downloadUrl") as string),
                            size: (_.get(content, "data.result.content.size") as number)
                        }];

                        // get the child contents
                        let childNodes = _.get(content, "data.result.content.childNodes")
                        if (!_.isEmpty(childNodes)) {
                            let childrenContentsRes = await HTTPService.post(`${process.env.APP_BASE_URL}/api/content/v1/search`,
                                {
                                    "request": {
                                        "filters": {
                                            "identifier": childNodes,
                                            "mimeType": { "!=": "application/vnd.ekstep.content-collection" }
                                        }
                                    }
                                }, {
                                    headers: {
                                        "Content-Type": "application/json"
                                    }
                                }).toPromise();
                            if (_.get(childrenContentsRes, 'data.result.count')) {
                                let contents = _.get(childrenContentsRes, 'data.result.content');
                                for (let content of contents) {
                                    downloadFiles.push({
                                        id: (_.get(content, "identifier") as string),
                                        url: (_.get(content, "downloadUrl") as string),
                                        size: (_.get(content, "size") as number)
                                    })
                                }
                            }

                        }
                        let downloadId = await downloadManager.download(downloadFiles, 'ecars')
                        await this.databaseSdk.insert("content_download", {
                            downloadId: downloadId,
                            contentId: _.get(content, "data.result.content.identifier"),
                            name: _.get(content, "data.result.content.name"),
                            status: CONTENT_DOWNLOAD_STATUS.Submitted,
                            metadata: _.get(content, 'data.result.content'),
                            createdOn: Date.now(),
                            updatedOn: Date.now()
                        })
                        return res.send(Response.success("api.content.read", { downloadId }));
                    }
                } else {
                    logger.error(`while processing download request ${content}, for content ${req.params.id}`);
                    return res.send(Response.error("api.content.download", 500))
                }

            } catch (error) {
                logger.error(`while processing download request ${error}, for content ${req.params.id}`);
                res.send({ error: req.params.id })
            }
        })()
    }

}