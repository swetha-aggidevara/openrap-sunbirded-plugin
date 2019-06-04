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
enum API_DOWNLOAD_STATUS {
    inprogress = "INPROGRESS",
    submitted = "SUBMITTED",
    completed = "COMPLETED",
    failed = "FAILED"
}
let dbName = "content_download";
export default class ContentDownload {

    private contentsFilesPath: string = 'content';
    private ecarsFolderPath: string = 'ecars';

    @Inject
    private databaseSdk: DatabaseSDK;

    private downloadManager;
    private pluginId;

    constructor(manifest: Manifest) {
        this.databaseSdk.initialize(manifest.id);
        this.pluginId = manifest.id;
        this.downloadManager = containerAPI.getDownloadManagerInstance(this.pluginId);
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
                        let downloadFiles = [{
                            id: (_.get(content, "data.result.content.identifier") as string),
                            url: (_.get(content, "data.result.content.downloadUrl") as string),
                            size: (_.get(content, "data.result.content.size") as number)
                        }]
                        let downloadId = await downloadManager.download(downloadFiles, 'ecars')
                        let queueMetaData = {
                            mimeType: _.get(content, 'data.result.content.mimeType'),
                            items: downloadFiles,
                        }

                        await this.databaseSdk.insert(dbName, {
                            downloadId: downloadId,
                            contentId: _.get(content, "data.result.content.identifier"),
                            name: _.get(content, "data.result.content.name"),
                            status: CONTENT_DOWNLOAD_STATUS.Submitted,
                            queueMetaData: queueMetaData,
                            createdOn: Date.now(),
                            updatedOn: Date.now()
                        })
                        return res.send(Response.success("api.content.download", { downloadId }));
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
                        let queueMetaData = {
                            mimeType: _.get(content, 'data.result.content.mimeType'),
                            items: downloadFiles,
                        }
                        await this.databaseSdk.insert(dbName, {
                            downloadId: downloadId,
                            contentId: _.get(content, "data.result.content.identifier"),
                            name: _.get(content, "data.result.content.name"),
                            status: CONTENT_DOWNLOAD_STATUS.Submitted,
                            queueMetaData: queueMetaData,
                            createdOn: Date.now(),
                            updatedOn: Date.now()
                        })
                        return res.send(Response.success("api.content.download", { downloadId }));
                    }
                } else {
                    logger.error(`while processing download request ${content}, for content ${req.params.id}`);
                    res.status(500)
                    return res.send(Response.error("api.content.download", 500))
                }

            } catch (error) {
                logger.error(`while processing download request ${error}, for content ${req.params.id}`);
                res.status(500)
                return res.send(Response.error("api.content.download", 500))
            }
        })()
    }

    list(req: any, res: any): any {
        (async () => {
            try {
                let status = [API_DOWNLOAD_STATUS.submitted, API_DOWNLOAD_STATUS.inprogress, API_DOWNLOAD_STATUS.completed, API_DOWNLOAD_STATUS.failed];
                if (!_.isEmpty(_.get(req, 'body.request.filters.status'))) {
                    status = _.get(req, 'body.request.filters.status');
                }
                let submitted = [];
                let inprogress = [];
                let failed = [];
                let completed = [];
                if (_.indexOf(status, API_DOWNLOAD_STATUS.submitted) !== -1) {
                    // submitted - get from the content downloadDB and merge with data
                    let submitted_CDB = await this.databaseSdk.find(dbName, {
                        "selector": {
                            "status": CONTENT_DOWNLOAD_STATUS.Submitted
                        }
                    });
                    if (!_.isEmpty(submitted_CDB.docs)) {
                        submitted = _.map(submitted_CDB.docs, (doc) => {
                            return {
                                "id": doc.downloadId,
                                "contentId": doc.contentId,
                                "name": doc.name,
                                "status": CONTENT_DOWNLOAD_STATUS.Submitted,
                                "createdOn": doc.createdOn
                            };
                        })
                    }
                }
                if (_.indexOf(status, API_DOWNLOAD_STATUS.completed) !== -1) {

                    let completed_CDB = await this.databaseSdk.find(dbName, {
                        "selector": {
                            "status": CONTENT_DOWNLOAD_STATUS.Indexed
                        },
                        "limit": 50,
                        "use_index": "created_on_sort_index",
                        "sort": [
                            {
                                "createdOn": "desc"
                            }
                        ]
                    });
                    if (!_.isEmpty(completed_CDB.docs)) {
                        completed = _.map(completed_CDB.docs, (doc) => {
                            return {
                                "id": doc.downloadId,
                                "contentId": doc.contentId,
                                "name": doc.name,
                                "status": API_DOWNLOAD_STATUS.completed,
                                "createdOn": doc.createdOn
                            };
                        })
                    }
                }

                // inprogress - get from download queue and merge with content data
                if (_.indexOf(status, API_DOWNLOAD_STATUS.inprogress) !== -1) {
                    let inprogressItems = await this.downloadManager.list(["INPROGRESS"]);
                    if (!_.isEmpty(inprogressItems)) {
                        let downloadIds = _.map(inprogressItems, 'id');
                        submitted = _.filter(submitted, (s) => { return _.indexOf(downloadIds, s.id) === -1 });
                        let itemIn_CDB = await this.databaseSdk.find(dbName, {
                            "selector": {
                                "downloadId": {
                                    "$in": downloadIds
                                }
                            },
                            "use_index": "created_on_sort_index",
                            "sort": [
                                {
                                    "createdOn": "desc"
                                }
                            ]
                        });
                        _.forEach(inprogressItems, (item) => {
                            let contentItem = _.find(itemIn_CDB.docs, { downloadId: item.id })
                            inprogress.push({
                                id: item.id,
                                name: _.get(contentItem, 'name') || 'Unnamed download',
                                totalSize: item.stats.totalSize,
                                downloadedSize: item.stats.downloadedSize,
                                status: API_DOWNLOAD_STATUS.inprogress,
                                createdOn: _.get(contentItem, 'createdOn') || item.createdOn
                            })
                        })
                    }
                }


                // failed -  get from the content downloadDB and download queue

                if (_.indexOf(status, API_DOWNLOAD_STATUS.failed) !== -1) {

                    let failed_CDB = await this.databaseSdk.find(dbName, {
                        "selector": {
                            "status": CONTENT_DOWNLOAD_STATUS.Failed
                        },
                        "limit": 50,
                        "use_index": "created_on_sort_index",
                        "sort": [
                            {
                                "createdOn": "desc"
                            }
                        ]
                    });
                    if (!_.isEmpty(failed_CDB.docs)) {
                        failed = _.map(failed_CDB.docs, (doc) => {
                            return {
                                "id": doc.downloadId,
                                "contentId": doc.contentId,
                                "name": doc.name,
                                "status": API_DOWNLOAD_STATUS.failed,
                                "createdOn": doc.createdOn
                            };
                        })
                    }
                }


                return res.send(Response.success("api.content.download.list", {
                    response: {
                        downloads: {
                            submitted: submitted,
                            inprogress: inprogress,
                            failed: failed,
                            completed: completed
                        }
                    }
                }));

            } catch (error) {
                logger.error(`error while processing the list request, ${req.body} , error: ${error}`)
                res.status(500)
                return res.send(Response.error("api.content.download.list", 500))
            }
        })()
    }
}