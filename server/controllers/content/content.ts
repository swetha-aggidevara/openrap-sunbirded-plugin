import { Inject } from "typescript-ioc";
import DatabaseSDK from "../../sdk/database";
import * as _ from 'lodash';
import config from "../../config";
import Response from '../../utils/response';
import { Manifest } from "@project-sunbird/ext-framework-server/models";
import * as Busboy from 'busboy';
import * as fs from 'fs';
import { logger } from '@project-sunbird/ext-framework-server/logger';
import * as path from 'path';
import ContentManager from "../../manager/ContentManager";
import * as uuid from 'uuid';
import Hashids from 'hashids';
import { containerAPI } from "OpenRAP/dist/api";

export default class Content {

    private contentsFilesPath: string = 'content';
    private ecarsFolderPath: string = 'ecars';

    @Inject
    private databaseSdk: DatabaseSDK;

    @Inject
    private contentManager: ContentManager;

    private fileSDK;

    constructor(manifest: Manifest) {
        this.databaseSdk.initialize(manifest.id);
        this.fileSDK = containerAPI.getFileSDKInstance(manifest.id);
        this.contentManager.initialize(manifest.id,
            this.fileSDK.getAbsPath(this.contentsFilesPath),
            this.fileSDK.getAbsPath(this.ecarsFolderPath));
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
        let downloadsPath = this.fileSDK.getAbsPath(this.ecarsFolderPath);
        let busboy = new Busboy({ headers: req.headers });

        busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
            // since file name's are having spaces we will generate uniq string as filename 
            let hash = new Hashids(uuid.v4(), 25);
            let uniqFileName = hash.encode(1).toLowerCase() + path.extname(filename);
            let filePath = path.join(downloadsPath, uniqFileName);
            req.fileName = uniqFileName;
            req.filePath = filePath;
            logger.info(`Uploading of file  ${filePath} started`);
            file.pipe(fs.createWriteStream(filePath));
        });
        busboy.on('finish', () => {
            logger.info(`Upload complete of the file ${req.filePath}`);
            this.contentManager.startImport(req.fileName).then(data => {
                logger.info(`File extraction successful for file ${req.filePath}`);
                res.send({ success: true })
            }).catch(error => {
                logger.error(`Error while file extraction  of file ${req.filePath}`, error);
                res.send({ error: true })
            })

        });

        return req.pipe(busboy);
    }

    export(req: any, res: any): any {
        (async () => {
            try {
                let id = req.params.id;
                // get the data from content db     
                let content = await this.databaseSdk.get('content', id);
                if (content.mimeType !== "application/vnd.ekstep.content-collection") {
                    let filePath = this.fileSDK.getAbsPath(path.join("ecars", content.desktopAppMetadata.ecarFile))
                    fs.stat(filePath, (err) => {
                        if (err) {
                            logger.error(`ecar file not available while exporting for content ${id} ${err}`)
                            res.status(500)
                            return res.send(Response.error("api.content.export", 500))
                        } else {
                            res.status(200)
                            res.send(Response.success(`api.content.export`, {
                                response: {
                                    url: req.protocol + '://' + req.get('host') + '/ecars/' + content.desktopAppMetadata.ecarFile
                                }
                            }));
                        }
                    })

                } else {
                    //     - get the spine ecar
                    let collectionEcarPath = path.join("ecars", content.desktopAppMetadata.ecarFile);
                    //     - unzip to temp folder
                    await this.fileSDK.mkdir('temp')
                    let collectionFolderPath = await this.fileSDK.unzip(collectionEcarPath, 'temp', true);
                    let manifest = await this.fileSDK.readJSON(path.join(collectionFolderPath, "manifest.json"))
                    // - read all childNodes and get non-collection items
                    let items = _.get(manifest, 'archive.items');
                    let parent: any | undefined = _.find(items, (i) => {
                        return (i.mimeType === 'application/vnd.ekstep.content-collection' && i.visibility === 'Default')
                    });
                    const childNodes = _.get(parent, 'childNodes');
                    let collectionFolderRelativePath = path.join('temp', path.parse(collectionEcarPath).name);

                    if (!_.isEmpty(childNodes)) {
                        let { docs: childContents = [] } = await this.databaseSdk.find('content', {
                            selector: {
                                "$and": [
                                    {
                                        "_id": {
                                            "$in": childNodes
                                        }
                                    },
                                    {
                                        "mimeType": {
                                            "$nin": ["application/vnd.ekstep.content-collection"]
                                        }
                                    }
                                ]
                            }
                        })
                        for (let childContent of childContents) {
                            let ecarPath = _.get(childContent, 'desktopAppMetadata.ecarFile');
                            if (!_.isEmpty(ecarPath)) {
                                let contentFolderPath = path.join(collectionFolderRelativePath, childContent.identifier);
                                await this.fileSDK.remove(contentFolderPath).catch(error => {
                                    logger.error(`while deleting the folder in collection ${contentFolderPath}`)
                                });
                                await this.fileSDK.mkdir(contentFolderPath)
                                await this.fileSDK.unzip(path.join('ecars', ecarPath), contentFolderPath, false);
                            }
                        }
                    }

                    // - Zip the spine_folder and download  
                    await this.fileSDK.zip(collectionFolderRelativePath, 'temp', `${parent.name}.ecar`);
                    res.status(200)
                    res.send(Response.success(`api.content.export`, {
                        response: {
                            url: req.protocol + '://' + req.get('host') + '/temp/' + `${parent.name}.ecar`
                        }
                    }));
                }
            } catch (error) {
                logger.error(`while processing the content  export ${req.params.id}  ${error}`);
                res.status(500)
                return res.send(Response.error("api.content.export", 500))
            }
        })()
    }

}