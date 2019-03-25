import FolderWatcher from './FolderWatcher';
import { Inject } from 'typescript-ioc';
import FileSDK from './../sdk/file';
import * as path from 'path';
import * as glob from 'glob';
import * as _ from 'lodash';
import DatabaseSDK from './../sdk/database';

export default class ContentManager {

    private pluginId: string;
    private folderPath: string;
    private contentFilesPath: string;
    private downloadsFolderPath: string;

    @Inject
    private folderWatcher: FolderWatcher;

    @Inject
    private fileSDK: FileSDK

    @Inject dbSDK: DatabaseSDK;

    private watcher: any;

    initialize(pluginId, contentFilesPath, downloadsFolderPath) {
        this.downloadsFolderPath = downloadsFolderPath;
        this.contentFilesPath = contentFilesPath;
        this.folderWatcher.initialize(pluginId);
        this.dbSDK.initialize(pluginId);
        this.fileSDK.initialize(pluginId);

        this.watcher = this.folderWatcher.addWatcher(this.downloadsFolderPath);
        this.watcher
            .on('add', path => {
                console.log(`File ${path} has been added`)
                this.onCreate(path)
            })
            .on('change', path => console.log(`File ${path} has been changed`))
            .on('unlink', path => console.log(`File ${path} has been removed`));


    }


    async onCreate(filePath) {
        try {
            // unzip to content_files folder
            await this.fileSDK.unzipFile(filePath, this.contentFilesPath, true)

            //try to get zip file inside the unzip folder from above step
            let assetFolderGlobPath = path.join(this.contentFilesPath, path.basename(filePath, path.extname(filePath)), '**', '*.zip')

            let zipFilePath = glob.sync(assetFolderGlobPath, {});
            if (zipFilePath.length > 0) {
                // unzip the file if we have zip file
                await this.fileSDK.unzipFile(zipFilePath[0], path.join(this.contentFilesPath, path.basename(filePath, path.extname(filePath))), false)
                //commenting deletion of the file
                // await this.fileSDK.deleteDir(path.dirname(zipFilePath[0])).catch(err => {
                //     console.log('Ignoring this error since deletion of the zip inside ecar is not as importent for now')
                // })

            }
            // read manifest file and add baseDir to manifest as content_files and folder name relative path
            let manifest = await this.fileSDK.readJSON(path.join(this.contentFilesPath, path.basename(filePath, path.extname(filePath)), 'manifest.json'));
            let items = _.get(manifest, 'archive.items');
            if (items && _.isArray(items) &&
                items.length > 0) {
                let metaData = items[0];
                metaData.baseDir = path.join('content_files', path.basename(filePath, path.extname(filePath)));
                //insert metadata to content database
                await this.dbSDK.insert('content', metaData.identifier, metaData)
            }



        } catch (error) {
            console.log("Error while importing files which are added to downloads folder ", error);
        }

    }

    onUpdate(filePath, currentStat, previousStat) {

    }

    onDelete(filePath, currentStat) {

    }

}