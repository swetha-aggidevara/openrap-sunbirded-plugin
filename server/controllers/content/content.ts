import { Inject } from "typescript-ioc";
import DatabaseSDK from "../../sdk/database";
import * as _ from "lodash";
import config from "../../config";
import Response from "../../utils/response";
import { Manifest } from "@project-sunbird/ext-framework-server/models";
import * as Busboy from "busboy";
import * as fs from "fs";
import { logger } from "@project-sunbird/ext-framework-server/logger";
import * as path from "path";
import ContentManager from "../../manager/ContentManager";
import * as uuid from "uuid";
import Hashids from "hashids";
import { containerAPI } from "OpenRAP/dist/api";
import * as TreeModel from "tree-model";
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
        this.contentManager.initialize(
            manifest.id,
            this.fileSDK.getAbsPath(this.contentsFilesPath),
            this.fileSDK.getAbsPath(this.ecarsFolderPath)
        );
    }

    searchInDB(filters, sort?) {
        let modifiedFilters: Object = _.mapValues(filters, (v, k) => {
            if (k !== 'query') return ({ '$in': v })
        });
        delete modifiedFilters['query'];
        if (_.get(filters, 'query')) {
            modifiedFilters['name'] = {
                "$regex": new RegExp(_.get(filters, 'query'), 'i')
            }
        }
        modifiedFilters['visibility'] = 'Default';
        let dbFilters = {
            selector: modifiedFilters,
            limit: parseInt(config.get('CONTENT_SEARCH_LIMIT'), 10)
        }
        if (sort) {
            for (let sortFields of Object.keys(sort)) {
                dbFilters.selector[sortFields] = {
                    "$gt": null
                }
            }
            dbFilters['sort'] = [sort];
        }
        return this.databaseSdk.find('content', dbFilters);
    } 
   
    get(req: any, res: any): any {
        let id = req.params.id;
        this.databaseSdk
          .get('content', id)
          .then(data => {
            data = _.omit(data, ['_id', '_rev']);
            let resObj = {
              content: data
            };
            return res.send(Response.success('api.content.read', resObj));
          })
          .catch(err => {
            logger.error(
              `Received error while getting the data from content database with id: ${id} and err.message: ${err}`
            );
            if (err.status === 404) {
              res.status(404);
              return res.send(Response.error('api.content.read', 404));
            } else {
              let status = err.status || 500;
              res.status(status);
              return res.send(Response.error('api.content.read', status));
            }
          });
      }

      search(req: any, res: any): any {
        let reqBody = req.body;
        let pageReqFilter = _.get(reqBody, 'request.filters');
        let contentSearchFields = config.get('CONTENT_SEARCH_FIELDS').split(',');

        let filters = _.pick(pageReqFilter, contentSearchFields);
        filters = _.mapValues(filters, function (v) {
            return _.isString(v) ? [v] : v;
        });
        let query = _.get(reqBody, 'request.query');
        if (!_.isEmpty(query)) {
            filters.query = query;
        }
        this.searchInDB(filters)
            .then(data => {
                data = _.map(data.docs, doc => _.omit(doc, ['_id', '_rev']));
                let resObj = {};
                if (data.length === 0) {
                    resObj = {
                        content: [],
                        count: 0
                    };
                } else {
                    resObj = {
                        content: data,
                        count: data.length
                    };
                }

                return res.send(Response.success('api.content.search', resObj));
            })
            .catch(err => {
                console.log(err);
                logger.error(
                    `Received error while searching content - err.message: ${
                    err.message
                    } ${err}`
                );
                if (err.status === 404) {
                    res.status(404);
                    return res.send(Response.error('api.content.search', 404));
                } else {
                    let status = err.status || 500;
                    res.status(status);
                    return res.send(Response.error('api.content.search', status));
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
            this.contentManager
                .startImport(req.fileName)
                .then(data => {
                    logger.info(`File extraction successful for file ${req.filePath}`);
                    res.send({ success: true, content: data });
                })
                .catch(error => {
                    logger.error(
                        `Error while file extraction  of file ${req.filePath}`,
                        error
                    );
                    res.send({ error: true });
                });
        });

        return req.pipe(busboy);
    }

    export(req: any, res: any): any {
        (async () => {
            try {
                let id = req.params.id;
                // get the data from content db
                let content = await this.databaseSdk.get('content', id);
                if (content.mimeType !== 'application/vnd.ekstep.content-collection') {
                    let filePath = this.fileSDK.getAbsPath(
                        path.join('ecars', content.desktopAppMetadata.ecarFile)
                    );
                    fs.stat(filePath, async err => {
                        if (err) {
                            logger.error(
                                `ecar file not available while exporting for content ${id} and err.message: ${
                                err.message
                                }`
                            );
                            res.status(500);
                            return res.send(Response.error('api.content.export', 500));
                        } else {
                            await this.fileSDK.copy(
                                path.join('ecars', content.desktopAppMetadata.ecarFile),
                                path.join('temp', `${content.name}.ecar`)
                            );
                            this.cleanUpExports(path.join('temp', `${content.name}.ecar`));
                            res.status(200);
                            res.send(
                                Response.success(`api.content.export`, {
                                    response: {
                                        url: `${req.protocol}://${req.get('host')}/temp/${
                                            content.name
                                            }.ecar`
                                    }
                                })
                            );
                        }
                    });
                } else {
                    //     - get the spine ecar
                    let collectionEcarPath = path.join(
                        'ecars',
                        content.desktopAppMetadata.ecarFile
                    );
                    //     - unzip to temp folder
                    await this.fileSDK.mkdir('temp');
                    let collectionFolderPath = await this.fileSDK.unzip(
                        collectionEcarPath,
                        'temp',
                        true
                    );
                    let manifest = await this.fileSDK.readJSON(
                        path.join(collectionFolderPath, 'manifest.json')
                    );
                    // - read all childNodes and get non-collection items
                    let items = _.get(manifest, 'archive.items');
                    let parent: any | undefined = _.find(items, i => {
                        return (
                            i.mimeType === 'application/vnd.ekstep.content-collection' &&
                            i.visibility === 'Default'
                        );
                    });
                    const childNodes = _.get(parent, 'childNodes');
                    let collectionFolderRelativePath = path.join(
                        'temp',
                        path.parse(collectionEcarPath).name
                    );

                    if (!_.isEmpty(childNodes)) {
                        let { docs: childContents = [] } = await this.databaseSdk.find(
                            'content',
                            {
                                selector: {
                                    $and: [
                                        {
                                            _id: {
                                                $in: childNodes
                                            }
                                        },
                                        {
                                            mimeType: {
                                                $nin: ['application/vnd.ekstep.content-collection']
                                            }
                                        }
                                    ]
                                }
                            }
                        );
                        for (let childContent of childContents) {
                            let ecarPath = _.get(childContent, 'desktopAppMetadata.ecarFile');
                            if (!_.isEmpty(ecarPath)) {
                                let contentFolderPath = path.join(
                                    collectionFolderRelativePath,
                                    childContent.identifier
                                );
                                await this.fileSDK.remove(contentFolderPath).catch(error => {
                                    logger.error(
                                        `while deleting the folder in collection ${contentFolderPath} `
                                    );
                                });
                                await this.fileSDK.mkdir(contentFolderPath);
                                await this.fileSDK.unzip(
                                    path.join('ecars', ecarPath),
                                    contentFolderPath,
                                    false
                                );
                            }
                        }
                    }

                    // - Zip the spine_folder and download
                    await this.fileSDK.zip(
                        collectionFolderRelativePath,
                        'temp',
                        `${parent.name}.ecar`
                    );
                    this.cleanUpExports(path.join('temp', `${parent.name}.ecar`));
                    res.status(200);
                    res.send(
                        Response.success(`api.content.export`, {
                            response: {
                                url:
                                    req.protocol +
                                    '://' +
                                    req.get('host') +
                                    '/temp/' +
                                    `${parent.name}.ecar`
                            }
                        })
                    );
                }
            } catch (error) {
                logger.error(
                    `Received error while processing the content export and err.message: ${
                    error.message
                    } `
                );
                res.status(500);
                return res.send(Response.error('api.content.export', 500));
            }
        })();
    }

    /*
          This method will clear the exported files after 5 min from the time the file is created
      */
    private cleanUpExports(file: string) {
        let interval = setInterval(() => {
            try {
                this.fileSDK.remove(file);
                clearInterval(interval);
            } catch (error) {
                logger.error(
                    `Received error while deleting the ${file} after export and err.message: ${
                    error.message
                    } `
                );
                clearInterval(interval);
            }
        }, 300000);
    }

    /* This method converts the buffer data to json and if any error will catch and return the buffer data */

    convertBufferToJson(proxyResData) {
        let proxyData;
        try {
            proxyData = JSON.parse(proxyResData.toString('utf8'));
        } catch (e) {
            console.log(e);
            logger.error(
                `Received error while parsing the buffer data to json: ${e}`
            );
            return proxyResData;
        }
        return proxyData;
    }

    /*This method is to whether content is present and to store all the contents in all page sections to one array */

    decorateSections(sections) {
        let contents = [];
        for (let section of sections) {
            if (!_.isEmpty(section.contents)) {
                for (let content of section.contents) {
                    contents.push(content);
                }
            }
        }
        return this.decorateContentWithProperty(contents);
    }

    /* This method is to check contents are present in DB */

    async decorateContentWithProperty(contents) {
        try {
            let listOfAllContentIds = [];
            for (let content of contents) {
                listOfAllContentIds.push(content.identifier);
            }
            let filters = { identifier: listOfAllContentIds };
            await this.searchInDB(filters)
                .then(data => {
                    for (let doc of data.docs) {
                        for (let content of contents) {
                            this.includeAddedToLibraryProperty(doc, content);
                        }
                    }
                })
                .catch(err => {
                    console.log(err);
                    logger.error(
                        `Received error while getting the data from database and err.message: ${
                        err.message
                        } ${err}`
                    );
                    return contents;
                });
        } catch (err) {
            console.log(err);
            logger.error(`Received  error err.message: ${err.message} ${err}`);
            return contents;
        }
        return contents;
    }

    /* This method is to check dialcode contents present in DB */

    decorateDialCodeContents(content) {
        const model = new TreeModel();
        let treeModel;
        treeModel = model.parse(content);
        let contents = [];
        contents.push(content);
        treeModel.walk(node => {
            if (node.model.mimeType !== 'application/vnd.ekstep.content-collection') {
                contents.push(node.model);
            }
        });
        return this.decorateContentWithProperty(contents);
    }

    /* This method is to include addedToLibrary property  for downloaded contents*/

    includeAddedToLibraryProperty(doc, content) {
        if (doc.identifier === content.identifier) {
            doc.addedToLibrary = true;
            content.addedToLibrary = true;
            try {
                this.databaseSdk.update('content', doc._id, doc);
            } catch (err) {
                console.log(err);
                logger.error(
                    `Received error while updating the database and err.message: ${
                    err.message
                    } ${err}`
                );
            }
        }
    }
}
