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
    async startImport(fileName) {

        // unzip to content_files folder
        await this.fileSDK.unzip(path.join('ecars', fileName), 'content', true)

        // read manifest file and add baseDir to manifest as content and folder name relative path
        let manifest = await this.fileSDK.readJSON(path.join(this.contentFilesPath, path.basename(fileName, path.extname(fileName)), 'manifest.json'));
        logger.info(`file is unzipped and reading manifest file and base dir to manifest as content and folder name relative path`);
        let items = _.get(manifest, 'archive.items');
        if (items && _.isArray(items) &&
            items.length > 0) {
            // check if it is collection type or not   
            logger.info(`checking if the data is of type collection or not`);
            let parent: any | undefined = _.find(items, (i) => {
                return (i.mimeType === 'application/vnd.ekstep.content-collection' && i.visibility === 'Default')
            });

            if (parent) {
                // check content compatibility level 
                logger.info(`Checking content compatability level for the collection`);
                if (_.get(parent, 'compatibilityLevel') && parent.compatibilityLevel > config.get("CONTENT_COMPATIBILITY_LEVEL")) {
                    throw `content compatibility is higher then content level : ${parent.compatibilityLevel} app supports ${config.get("CONTENT_COMPATIBILITY_LEVEL")}`;
                }

                let itemsClone = _.cloneDeep(items);
                logger.debug(`Creating Hierarchy for the collection whose version number: ${_.get(parent, 'pkgVersion')} and version key: ${_.get(parent, 'versionKey')}`);
                let children = this.createHierarchy(itemsClone, parent)
                parent['children'] = children;
                parent.desktopAppMetadata = {
                    "ecarFile": fileName,  // relative to ecar folder
                    "addedUsing": "import",
                    "createdOn": Date.now(),
                    "updatedOn": Date.now()
                }
                logger.info(`Upserting the collection details in database `);
                await this.dbSDK.upsert('content', parent.identifier, parent);

                let resources = _.filter(items, (i) => {
                    return (i.mimeType !== 'application/vnd.ekstep.content-collection')
                });

                //insert the resources to content db
                if (!_.isEmpty(resources)) {
                    await resources.forEach(async (resource) => {
                        // if (_.indexOf(['application/vnd.ekstep.ecml-archive', 'application/vnd.ekstep.html-archive'], resource.mimeType) >= 0) {
                        resource.baseDir = `content/${resource.identifier}`;
                        // } else {
                        //     resource.baseDir = 'content';
                        // }

                        resource.appIcon = resource.appIcon ? `content/${resource.appIcon}` : resource.appIcon;
                        await this.dbSDK.upsert('content', resource.identifier, resource);
                    })
                }

                //copy directores to content files folder with manifest
                let parentDirPath = path.join(this.contentFilesPath, path.basename(fileName, path.extname(fileName)));
                fs.readdir(parentDirPath, async (err, files) => {
                    //handling error
                    if (err) {
                        logger.error('Error while reading the directory when importing collection', err)
                    } else {
                        files.forEach(async (file) => {
                            fs.lstat(path.join(parentDirPath, file), async (err, stats) => {
                                if (err) {
                                    logger.error('Error while reading files from collection directory', err)
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
                                        }
                                        await fse.ensureFile(path.join(parentDirPath, file, 'manifest.json')).catch(err => {
                                            if (err) {
                                                logger.error(`Error while creating manifest for file ${file}`, err);
                                            }
                                        })
                                        await fse.outputJson(path.join(parentDirPath, file, 'manifest.json'), manifest).catch(err => {
                                            if (err) {
                                                logger.error(`Error while updating manifest for file ${file} with manifest ${manifest}`, err);
                                            }
                                        })
                                        await fse.copy(path.join(parentDirPath, file), path.join(this.contentFilesPath, file)).catch(err => {
                                            if (err) {
                                                logger.error(`Error while copying the folder ${path.join(parentDirPath, file)} to content files from collection`, err);
                                            }
                                        })
                                        let zipFilePath = glob.sync(path.join(this.contentFilesPath, file, '**', '*.zip'), {});
                                        if (zipFilePath.length > 0) {
                                            // unzip the file if we have zip file
                                            let filePath = path.relative(this.fileSDK.getAbsPath(''), zipFilePath[0]);
                                            await this.fileSDK.unzip(filePath, path.join("content", file), false)
                                        }
                                    }
                                }
                            })
                        });
                    }
                })
            } else {

                // check content compatibility level 
                let metaData = items[0];
                logger.info(`Checking compatability level for the content whose version number: ${_.get(metaData, 'pkgVersion')} and version key: ${_.get(metaData, 'versionKey')}`);
                if (_.get(metaData, 'compatibilityLevel') && metaData.compatibilityLevel > config.get("CONTENT_COMPATIBILITY_LEVEL")) {
                    throw `content compatibility is higher then content level : ${metaData.compatibilityLevel} app supports ${config.get("CONTENT_COMPATIBILITY_LEVEL")}`;
                }
                //try to get zip file inside the unzip folder from above step
                let assetFolderGlobPath = path.join(this.contentFilesPath, path.basename(fileName, path.extname(fileName)), '**', '*.zip')

                let zipFilePath = glob.sync(assetFolderGlobPath, {});
                if (zipFilePath.length > 0) {
                    let filePath = path.relative(this.fileSDK.getAbsPath(''), zipFilePath[0]);
                    // unzip the file if we have zip file

                    await this.fileSDK.unzip(filePath, path.join("content", path.basename(fileName, path.extname(fileName))), false)
                }

                metaData.baseDir = `content/${path.basename(fileName, path.extname(fileName))}`;
                metaData.appIcon = metaData.appIcon ? `content/${path.basename(fileName, path.extname(fileName))}/${metaData.appIcon}` : metaData.appIcon;
                const desktopAppMetadata: IDesktopAppMetadata = {
                    "ecarFile": fileName,  // relative to ecar folder
                    "addedUsing": IAddedUsingType.import,
                    "createdOn": Date.now(),
                    "updatedOn": Date.now()
                }
                metaData.desktopAppMetadata = desktopAppMetadata;
                //insert metadata to content database
                // TODO: before insertion check if the first object is type of collection then prepare the collection and insert 
                logger.info(`Upserting the content and content details in database`)
                await this.dbSDK.upsert('content', metaData.identifier, metaData);
            }

        } else {
            logger.error('Ecar is having empty items ', manifest);
            throw Error(`Manifest doesn't have items to insert in database`)
        }
    }

    createHierarchy(items: any[], parent: any, tree?: any[]): any {
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
                _.each(children, (child) => { this.createHierarchy(items, child) });
            }
        }
        logger.info(`Hierarchy is created for the collection`);
        return tree;
    }

}