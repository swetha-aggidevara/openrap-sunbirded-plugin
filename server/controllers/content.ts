import { Inject } from "typescript-ioc";
import DatabaseSDK from "../sdk/database";
import * as _ from 'lodash';
import config from "./../config";
import Response from './../utils/response';
import { Manifest } from "@project-sunbird/ext-framework-server/models";
import * as Busboy from 'busboy';
import * as fs from 'fs';
import { logger } from '@project-sunbird/ext-framework-server/logger';
import * as path from 'path';
import FileSDK from "../sdk/file";
import ContentManager from "../manager/ContentManager";

export default class Content {

    private contentFilesPath: string = 'content_files';
    private downloadsFolderPath: string = 'downloads';

    @Inject
    private databaseSdk: DatabaseSDK;

    @Inject
    private fileSDK: FileSDK;

    @Inject
    private contentManager: ContentManager;

    constructor(manifest: Manifest) {
        this.databaseSdk.initialize(manifest.id);
        this.fileSDK.initialize(manifest.id);
        this.contentManager.initialize(manifest.id,
            this.fileSDK.geAbsolutePath(this.contentFilesPath),
            this.fileSDK.geAbsolutePath(this.downloadsFolderPath));
    }

    searchInDB(filters) {
        let modifiedFilters: Object = _.mapValues(filters, (v) => ({ '$in': v }));
        modifiedFilters['visibility'] = 'Default';
        let dbFilters = {
            selector: modifiedFilters,
            limit: parseInt(config.get('CONTENT_SEARCH_LIMIT'), 10)
        }
        return this.databaseSdk.find('content', dbFilters);
    }

    get(req: any, res: any): any {
        let id = req.params.id;
        this.databaseSdk.get('content', id)
            .then(data => {
                data = _.omit(data, ['_id', '_rev'])
                let resObj = {
                    content: data
                }
                return res.send(Response.success("api.content.read", resObj));
            })
            .catch(err => {

                if (err.statusCode === 404) {
                    res.status(404)
                    return res.send(Response.error("api.content.read", 404));
                } else {
                    let statusCode = err.statusCode || 500;
                    res.status(statusCode)
                    return res.send(Response.error("api.content.read", statusCode));
                }
            });
    }

    search(req: any, res: any): any {
        let reqBody = req.body;
        let pageReqFilter = _.get(reqBody, 'request.filters');
        let contentSearchFields = config.get('CONTENT_SEARCH_FIELDS').split(',');

        let filters = _.pick(pageReqFilter, contentSearchFields);
        filters = _.mapValues(filters, function (v) { return _.isString(v) ? [v] : v; });
        this.searchInDB(filters).then(data => {
            data = _.map(data.docs, doc => _.omit(doc, ['_id', '_rev']))
            let resObj = {};
            if (data.length === 0) {
                resObj = {
                    content: [],
                    count: 0
                }
            } else {
                resObj = {
                    content: data,
                    count: data.length
                }
            }

            return res.send(Response.success("api.content.search", resObj));
        }).catch(err => {
            console.log(err)
            if (err.statusCode === 404) {
                res.status(404)
                return res.send(Response.error("api.content.search", 404));
            } else {
                let statusCode = err.statusCode || 500;
                res.status(statusCode)
                return res.send(Response.error("api.content.search", statusCode));
            }
        });
    }

    import(req: any, res: any): any {
        let downloadsPath = config.get('downloads_path');
        let busboy = new Busboy({ headers: req.headers });

        busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
            let filePath = path.join(downloadsPath, filename);
            req.filePath = filePath
            logger.info(`Uploading of file  ${filePath} started`);
            file.pipe(fs.createWriteStream(path.join(downloadsPath, filename)));
        });
        busboy.on('finish', () => {
            logger.info(`Upload complete of the file ${req.filePath}`);
            this.contentManager.onCreate(req.filePath).then(data => {
                logger.info(`File extraction successful for file ${req.filePath}`);
                res.send({ success: true })
            }).catch(error => {
                logger.error(`Error while file extraction  of file ${req.filePath}`, error);
                res.send({ error: true })
            })

        });

        return req.pipe(busboy);
    }

}