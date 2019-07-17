import { Inject } from 'typescript-ioc';
import * as path from 'path';
import * as glob from 'glob';
import * as _ from 'lodash';
import DatabaseSDK from './../sdk/database';
import { logger } from '@project-sunbird/ext-framework-server/logger';
import * as fs from 'fs';
import * as uuid from 'uuid';
import * as fse from 'fs-extra';
import { containerAPI } from 'OpenRAP/dist/api';
import { manifest } from '../manifest';
import { isRegExp } from 'util';
import config from '../config';
import { IDesktopAppMetadata, IAddedUsingType } from '../controllers/content/IContent';


export default class ContentManager {

    private pluginId: string;
    private contentFilesPath: string;
    private downloadsFolderPath: string;


    private fileSDK;

    @Inject dbSDK: DatabaseSDK;

    private watcher: any;

    initialize(pluginId, contentFilesPath, downloadsFolderPath) {
        this.pluginId = pluginId;
        this.downloadsFolderPath = downloadsFolderPath;
        this.contentFilesPath = contentFilesPath;
        this.dbSDK.initialize(pluginId);
        this.fileSDK = containerAPI.getFileSDKInstance(manifest.id);
    }



    // unzip ecar 
    // read manifest
    // check if the ecar is content or collection
    // if content
    // unzip internal folder and update/insert content db
    // if collection
    // if it has only one manifest.json
    // prepare hierarchy and insert/update in content db
    // if it has manifest with content folders   
    // prepare hierarchy and insert   
    async startImport(fileName, x_msgId) {
        logger.debug(`X-msgID = "${x_msgId}": File extraction is started for the file: ${fileName}`)
        // unzip to content_files folder
        logger.info(`X-msgID = "${x_msgId}": File has to be unzipped`);
        await this.fileSDK.unzip(path.join('ecars', fileName), 'content', true)
        logger.info(`X-msgID = "${x_msgId}": File is unzipped and reading the manifest file to add basedir to manifest as content and folder name relative path`);
        // read manifest file and add baseDir to manifest as content and folder name relative path
        let manifest = await this.fileSDK.readJSON(path.join(this.contentFilesPath, path.basename(fileName, path.extname(fileName)), 'manifest.json'));
        let items = _.get(manifest, 'archive.items');
        if (items && _.isArray(items) &&
            items.length > 0) {
            // check if it is collection type or not   
            logger.debug(`X-msgID = "${x_msgId}": checking if the content is of type collection or not`);
            let parent: any | undefined = _.find(items, (i) => {
                return (i.mimeType === 'application/vnd.ekstep.content-collection' && i.visibility === 'Default')
            });

            if (parent) {
                logger.info(`X-msgID = "${x_msgId}": Found content is of type collection`);
                // check content compatibility level 
                logger.info(`X-msgID = "${x_msgId}": Checking content compatability. Collection compatabilitylevel > content compatabilitylevel`);
                if (_.get(parent, 'compatibilityLevel') && parent.compatibilityLevel > config.get("CONTENT_COMPATIBILITY_LEVEL")) {
                    throw `content compatibility is higher then content level : ${parent.compatibilityLevel} app supports ${config.get("CONTENT_COMPATIBILITY_LEVEL")}`;
                }
                logger.info(`X-msgID = "${x_msgId}": collection compatability > content compatability level`);
                let itemsClone = _.cloneDeep(items);
                logger.debug(`X-msgID = "${x_msgId}": Content compatability level is checked and has to create Hierarchy for the Parent collection: ${_.get(parent, 'identifier')}  versionNumber: ${_.get(parent, 'pkgVersion')} and versionKey: ${_.get(parent, 'versionKey')}`);
                let children = this.createHierarchy(itemsClone, parent, x_msgId)
                parent['children'] = children;
                logger.info(`X-msgID = "${x_msgId}": Adding metadata for parent`);
                parent.desktopAppMetadata = {
                    "ecarFile": fileName,  // relative to ecar folder
                    "addedUsing": "import",
                    "createdOn": Date.now(),
                    "updatedOn": Date.now()
                }
                logger.info(`X-msgID = "${x_msgId}":  Collection: ${_.get(parent, 'identifier')} has to be upserted in database`);
                await this.dbSDK.upsert('content', parent.identifier, parent);
                logger.info(`X-msgID = "${x_msgId}": Collection is upserted in ContentDB `)
                logger.info(`X-msgID = "${x_msgId}": Getting all the resources in Collection`)
                let resources = _.filter(items, (i) => {
                    return (i.mimeType !== 'application/vnd.ekstep.content-collection')
                });
                logger.info(`X-msgID = "${x_msgId}": Inserting the resources in collection to ContentDB`)
                //insert the resources to content db
                if (!_.isEmpty(resources)) {
                    await resources.forEach(async (resource) => {
                        logger.info(`X-msgID = "${x_msgId}": including baseDir for all the resources in collection`)
                        // if (_.indexOf(['application/vnd.ekstep.ecml-archive', 'application/vnd.ekstep.html-archive'], resource.mimeType) >= 0) {
                        resource.baseDir = `content/${resource.identifier}`;
                        // } else {
                        //     resource.baseDir = 'content';
                        // }

                        resource.appIcon = resource.appIcon ? `content/${resource.appIcon}` : resource.appIcon;
                        logger.debug(`X-msgID = "${x_msgId}":added baseDir for Resources and inserting in ContentDB`)
                        await this.dbSDK.upsert('content', resource.identifier, resource);
                        logger.info(`X-msgID = "${x_msgId}": Resources are inserted in ContentDB`)
                    })
                }

                //copy directores to content files folder with manifest
                logger.info(`X-msgID = "${x_msgId}": coping directories to content files folder with manifest`)
                let parentDirPath = path.join(this.contentFilesPath, path.basename(fileName, path.extname(fileName)));
                fs.readdir(parentDirPath, async (err, files) => {
                    logger.info(`X-msgID = "${x_msgId}": Handling the errors while coping directories to content files`);
                    //handling error
                    if (err) {
                        logger.error(`X-msgID = "${x_msgId}": Error while reading the directory when importing collection`, err)
                    } else {
                        files.forEach(async (file) => {
                            fs.lstat(path.join(parentDirPath, file), async (err, stats) => {
                                if (err) {
                                    logger.error(`X-msgID = "${x_msgId}": Error while reading files from collection directory`, err)
                                } else {
                                    if (stats.isDirectory()) {
                                        let manifest = {
                                            "id": "content.archive",
                                            "ver": "1.0",
                                            "ts": new Date().toISOString(),
                                            "params": {
                                                "resmsgid": uuid.v4()
                                            },
                                            "archive": {
                                                "count": 1,
                                                "items": []
                                            }
                                        }

                                        let item = _.find(items, { identifier: file })
                                        if (!_.isEmpty(item)) {
                                            manifest.archive.items.push(item)
                                            logger.info(`X-msgID = "${x_msgId}": Added manifest for the file`);
                                        }
                                        await fse.ensureFile(path.join(parentDirPath, file, 'manifest.json')).catch(err => {
                                            if (err) {
                                                logger.error(`X-msgID = "${x_msgId}": Error while creating manifest for file ${file}`, err);
                                            }
                                        })
                                        await fse.outputJson(path.join(parentDirPath, file, 'manifest.json'), manifest).catch(err => {
                                            if (err) {
                                                logger.error(`X-msgID = "${x_msgId}": Error while updating manifest for file ${file} with manifest ${manifest}`, err);
                                            }
                                        })
                                        await fse.copy(path.join(parentDirPath, file), path.join(this.contentFilesPath, file)).catch(err => {
                                            if (err) {
                                                logger.error(`X-msgID = "${x_msgId}": Error while copying the folder ${path.join(parentDirPath, file)} to content files from collection`, err);
                                            }
                                        })
                                        let zipFilePath = glob.sync(path.join(this.contentFilesPath, file, '**', '*.zip'), {});
                                        if (zipFilePath.length > 0) {
                                            // unzip the file if we have zip file
                                            console.log('fileeeee', file);
                                            logger.info(`X-msgID = "${x_msgId}":  Unzipping the file:${file} if the file is zip file`)
                                            let filePath = path.relative(this.fileSDK.getAbsPath(''), zipFilePath[0]);
                                            await this.fileSDK.unzip(filePath, path.join("content", file), false)
                                            logger.info(`X-msgID = "${x_msgId}":   file is unzipped`)
                                        }
                                    }
                                }
                            })
                        });
                    }
                })
            } else {

                logger.info(`X-msgID = "${x_msgId}": Found Content is not of type Collection`);
                // check content compatibility level 
                let metaData = items[0];
                logger.info(`X-msgID = "${x_msgId}": check (resource) content compatability > content compatability level`);
                if (_.get(metaData, 'compatibilityLevel') && metaData.compatibilityLevel > config.get("CONTENT_COMPATIBILITY_LEVEL")) {
                    throw `content compatibility is higher then content level : ${metaData.compatibilityLevel} app supports ${config.get("CONTENT_COMPATIBILITY_LEVEL")}`;
                }
                logger.info(`X-msgID = "${x_msgId}": (resource) content compatability > content compatability level`);
                //try to get zip file inside the unzip folder from above step
                let assetFolderGlobPath = path.join(this.contentFilesPath, path.basename(fileName, path.extname(fileName)), '**', '*.zip')

                let zipFilePath = glob.sync(assetFolderGlobPath, {});
                if (zipFilePath.length > 0) {
                    let filePath = path.relative(this.fileSDK.getAbsPath(''), zipFilePath[0]);
                    // unzip the file if we have zip file
                    logger.info(`X-msgID = "${x_msgId}": Unzipping the file if there are any zip files`)
                    await this.fileSDK.unzip(filePath, path.join("content", path.basename(fileName, path.extname(fileName))), false)
                    logger.info(`X-msgID = "${x_msgId}": Unzipped the file`)
                }

                metaData.baseDir = `content/${path.basename(fileName, path.extname(fileName))}`;
                metaData.appIcon = metaData.appIcon ? `content/${path.basename(fileName, path.extname(fileName))}/${metaData.appIcon}` : metaData.appIcon;
                const desktopAppMetadata: IDesktopAppMetadata = {
                    "ecarFile": fileName,  // relative to ecar folder
                    "addedUsing": IAddedUsingType.import,
                    "createdOn": Date.now(),
                    "updatedOn": Date.now()
                }
                logger.info(`X-msgID = "${x_msgId}": Metadata and basedir is added for the (resource) content`);
                metaData.desktopAppMetadata = desktopAppMetadata;
                //insert metadata to content database
                // TODO: before insertion check if the first object is type of collection then prepare the collection and insert
                logger.debug(`X-msgID = "${x_msgId}": (Resource) Content is upserting in the ContentDB`)
                await this.dbSDK.upsert('content', metaData.identifier, metaData);
            }

        } else {
            logger.error(`X-msgID = "${x_msgId}": Ecar is having empty items `, manifest);
            throw Error(`X-msgID = "${x_msgId}": Manifest doesn't have items to insert in database`)
        }
    }

    createHierarchy(items: any[], parent: any, x_msgId?: any,tree?: any[]): any {
        logger.debug(`X-msgID = "${x_msgId}": creating Hierarchy for the Collection`);
        logger.info(`X-msgID = "${x_msgId}": Getting child contents for Parent: ${_.get(parent, 'identifier')}`);
        tree = typeof tree !== 'undefined' ? tree : [];
        parent = typeof parent !== 'undefined' ? parent : { visibility: 'Default' };
        if (parent.children && parent.children.length) {
            let children = [];
            _.forEach(items, (child) => {
                let childWithIndex = _.find(parent.children, { 'identifier': child.identifier })
                if (!_.isEmpty(childWithIndex)) {
                    child.index = childWithIndex['index'];
                    children.push(child)
                }
            });
            if (!_.isEmpty(children)) {
                children = _.sortBy(children, 'index');
                if (parent.visibility === 'Default') {
                    tree = children;
                } else {
                    parent['children'] = children;
                }
                _.each(children, (child) => { this.createHierarchy(items, child, x_msgId) });
            }
        }
        logger.info(`X-msgID = "${x_msgId}": Hierarchy is created for the collection`);
        return tree;
    }

}