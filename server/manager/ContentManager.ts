import FolderWatcher from './FolderWatcher';
import { Inject } from 'typescript-ioc';
import FileSDK from './../sdk/file';
import * as path from 'path';

export default class ContentManager {

    private pluginId: string;
    private folderPath: string;
    private contentFilesPath: string = path.join(__dirname, 'content_files');
    private downloadsFolderPath: string = path.join(__dirname, 'downloads');

    @Inject
    private folderWatcher: FolderWatcher;

    @Inject
    private fileSDK: FileSDK

    initialize(pluginId) {
        this.folderWatcher.initialize(pluginId);
        this.folderWatcher.addWatcher(this.contentFilesPath, this.listener, (err) => {
            console.log('Error while adding watcher for file');
        });
        this.fileSDK.initialize(pluginId);
    }

    listener(changeType, fullPath, currentStat, previousStat) {
        switch (changeType) {
            case 'update':
                this.onUpdate(fullPath, currentStat, previousStat);
                break
            case 'create':
                this.onCreate(fullPath, currentStat);
                break
            case 'delete':
                this.onDelete(fullPath, previousStat);
                break
        }
    }

    async onCreate(filePath, currentStat) {
        // unzip to content_files folder
        await this.fileSDK.createFolder(this.contentFilesPath)
        await this.fileSDK.createFolder(this.downloadsFolderPath)
        await this.fileSDK.unzipFile(filePath, this.downloadsFolderPath)
        //  read manifest json

        // insert/update to content db

    }

    onUpdate(filePath, currentStat, previousStat) {

    }

    onDelete(filePath, currentStat) {

    }
}