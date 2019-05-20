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
import FileSDK from "OpenRAP/dist/sdks/FileSDK";


export default class ContentManager {

    private pluginId: string;
    private contentFilesPath: string;
    private ecarsFolderPath: string;

    @Inject dbSDK: DatabaseSDK;
    @Inject fileSDK: FileSDK;

    private watcher: any;

    initialize(pluginId, contentFilesPath, ecarsFolderPath) {
        this.pluginId = pluginId;
        this.ecarsFolderPath = ecarsFolderPath;
        this.contentFilesPath = contentFilesPath;
        this.dbSDK.initialize(pluginId);
        const fileSDK = containerAPI.getFileSDKInstance(pluginId);
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
    async onCreate(filePath) {

        // unzip to content folder
        await this.fileSDK.unzip(filePath, this.contentFilesPath, true)

        // read manifest file and add baseDir to manifest as content and folder name relative path
        let manifest = await this.fileSDK.readJSON(path.join(this.contentFilesPath, path.basename(filePath, path.extname(filePath)), 'manifest.json'));
        let items = _.get(manifest, 'archive.items');
        if (items && _.isArray(items) &&
            items.length > 0) {
            // check if it is collection type or not   
            let parent: any | undefined = _.find(items, (i) => {
                return (i.mimeType === 'application/vnd.ekstep.content-collection' && i.visibility === 'Default')
            });

            if (parent) {
                let itemsClone = _.cloneDeep(items);
                let children = this.createHierarchy(itemsClone, parent);
                parent.fileName = path.basename(filePath);
                parent['children'] = children;
                await this.dbSDK.update('content', parent.identifier, parent).catch(async (error) => {
                    logger.error('Error while updating the content from db before inserting ', error);
                    await this.dbSDK.insert('content', parent, parent.identifier);
                });

                let resources = _.filter(items, (i) => {
                    return (i.mimeType !== 'application/vnd.ekstep.content-collection')
                });

                //insert the resources to content db
                if (!_.isEmpty(resources)) {
                    await resources.forEach(async (resource) => {
                        if (_.indexOf(['application/vnd.ekstep.ecml-archive', 'application/vnd.ekstep.html-archive'], resource.mimeType) >= 0) {
                            resource.baseDir = `content/${resource.identifier}`;
                        } else {
                            resource.baseDir = 'content';
                        }

                        resource.appIcon = resource.appIcon ? `content/${resource.appIcon}` : resource.appIcon;
                        await this.dbSDK.update('content', resource.identifier, resource).catch(async (error) => {
                            logger.error('Error while updating the content from db before inserting ', error);
                            await this.dbSDK.insert('content', resource, resource.identifier);
                        });
                    })
                }
                

                //copy directores to content files folder with manifest
                let parentDirPath = path.join(this.contentFilesPath, path.basename(filePath, path.extname(filePath)));
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
                                            await this.fileSDK.unzip(zipFilePath[0], path.join(this.contentFilesPath, file), false)
                                        }
                                    }
                                }
                            })
                        });
                    }
                })
            } else {
                //try to get zip file inside the unzip folder from above step
                let assetFolderGlobPath = path.join(this.contentFilesPath, path.basename(filePath, path.extname(filePath)), '**', '*.zip')

                let zipFilePath = glob.sync(assetFolderGlobPath, {});
                if (zipFilePath.length > 0) {
                    // unzip the file if we have zip file
                    await this.fileSDK.unzip(zipFilePath[0], path.join(this.contentFilesPath, path.basename(filePath, path.extname(filePath))), false)
                    //commenting deletion of the file
                    await this.fileSDK.remove(path.dirname(zipFilePath[0])).catch(err => {
                        logger.info('Ignoring this error since deletion of the zip inside ecar is not as important for now', err)
                    })
                }
                let metaData = items[0];
                metaData.baseDir = `content/${path.basename(filePath, path.extname(filePath))}`;
                metaData.localDir = metaData.fileName = path.basename(filePath);
                metaData.appIcon = metaData.appIcon ? `content/${path.basename(filePath, path.extname(filePath))}/${metaData.appIcon}` : metaData.appIcon;
                //insert metadata to content database
                // TODO: before insertion check if the first object is type of collection then prepare the collection and insert 

                await this.dbSDK.update('content', metaData.identifier, metaData).catch(async (error) => {
                    logger.error('Error while updating the content from db before inserting ', error);
                    await this.dbSDK.insert('content', metaData, metaData.identifier);
                });
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
        return tree;
    }

}