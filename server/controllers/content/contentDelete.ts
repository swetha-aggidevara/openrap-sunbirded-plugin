import { logger } from "@project-sunbird/ext-framework-server/logger";
import { Manifest } from "@project-sunbird/ext-framework-server/models";
import * as childProcess from "child_process";
import * as _ from "lodash";
import { containerAPI } from "OpenRAP/dist/api";
import * as path from "path";
import { Inject } from "typescript-ioc";
import DatabaseSDK from "../../sdk/database";
import Response from "../../utils/response";
import Content from "./content";
let deleted = [];
const failed = [];
export default class ContentDelete {
    public contentPath;
    private workerProcessRef: childProcess.ChildProcess;
    @Inject
    private databaseSdk: DatabaseSDK;
    private fileSDK: any;
    private content: Content;
    constructor(manifest: Manifest) {
        this.content = new Content(manifest);
        this.databaseSdk.initialize(manifest.id);
        this.fileSDK = containerAPI.getFileSDKInstance(manifest.id);
        this.contentPath = [];
    }

    public async delete(req, res) {
        const reqId = req.headers["X-msgid"];
        logger.debug(`${reqId}: Delete method is called`);
        this.workerProcessRef = childProcess.fork(path.join(__dirname, "contentDeleteHelper"));
        const contentIDS: string[] = _.get(req.body, "request.contents");
        if (!contentIDS) {
            logger.error(`${reqId}: Error: content Ids not found`);
            return res.status(400).send(Response.error(`api.content.delete`, 400, "MISSING_CONTENTS"));
        }
        this.content.searchInDB({ identifier: contentIDS }, req.headers["X-msgid"]).then(async (data) => {
            const resObj = await this.checkMimeType(data.docs);
            res.send(Response.success("api.content.delete", resObj, req));
        }).catch((err) => {
            logger.error(`Received Error while searching in DB `, err);
            res.status(500);
            res.send(Response.error(`api.content.delete`, 500, err.errMessage || err.message, err.code));
        });
    }

    public async checkMimeType(contentsToDelete) {
        logger.debug(`checkMimeType() is called`);
        const deleteContents = [];
        for (const content of contentsToDelete) {
            content.desktopAppMetadata.isAvailable = false;
            content.desktopAppMetadata.artifactAdded = false;
            deleteContents.push(content);
            if (content.mimeType === "application/vnd.ekstep.content-collection") {
                const children = await this.getChildren(content);
                for (const child of children.docs) {
                    child.desktopAppMetadata.artifactAdded = false;
                    child.desktopAppMetadata.isAvailable = false;
                    deleteContents.push(child);
                }
            }
        }
        logger.debug(`updateContentsInDB() is called to update content dekstopAppMetadata`);
        await this.updateContentsInDB(deleteContents);
        this.workerProcessRef.send(deleted);
        return {deleted, failed};
    }

    public async updateContentsInDB(contents) {
        logger.debug(`updateContentsInDB() is called`);
        return this.databaseSdk.bulk("content", contents).then((contentData: any) => {
            const contentIDS = _.map(contentData, (content) => content.id);
            deleted = contentIDS;
        }).catch((error) => {
            logger.error(`Received Error while updating contents to delete Error: ${error.stack}`);
            failed.push({reason: error.message || error.errMessage});
        });
    }

    public async getChildren(collection) {
        logger.debug(`getChildren() is called`);
        const dbFilter = {
            selector: {
                $and: [
                    {
                        _id: {
                            $in: collection.childNodes,
                        },
                    },
                    {
                        mimeType: {
                            $nin: ["application/vnd.ekstep.content-collection"],
                        },
                    },
                ],
            },
        };
        logger.info(`finding all child contents of a collection:${collection.identifier}`);
        return await this.databaseSdk.find("content", dbFilter);
    }

    public async deleteReconciliation() {
        logger.debug(`deleteReconciliation() is called`);
        this.workerProcessRef = childProcess.fork(path.join(__dirname, "contentDeleteHelper"));
        const dbFilter = {
            selector: {
                "desktopAppMetadata.isAvailable": false,
            },
        };
        logger.info(`finding all contentsToDelete in Queue `);
        const contents = await this.databaseSdk.find("content", dbFilter).catch((error) => {
            logger.error(`Received Error while finding contents (isAvailable : false) Error: ${error.stack}`);
        });
        await this.checkMimeType(contents.docs).catch((error) => {
            logger.error(`Received Error while checkMimeType()
            in deleteReconciliation is called Error: ${error.stack}`);
        });
    }

}
