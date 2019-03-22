import FolderWatcher from './FolderWatcher';
import { Inject } from 'typescript-ioc';

export default class ContentManager {

    private pluginId: string;
    private folderPath: string;

    @Inject
    private folderWatcher: FolderWatcher;

    initialize(pluginId, folderPath, cb) {
        this.folderWatcher.initialize(pluginId);
        this.folderWatcher.addWatcher(folderPath, this.listener, cb);
    }

    listener(changeType, fullPath, currentStat, previousStat) {
        switch (changeType) {
            case 'update':
                console.log('the file', fullPath, 'was updated', currentStat, previousStat)
                break
            case 'create':
                console.log('the file', fullPath, 'was created', currentStat)
                break
            case 'delete':
                console.log('the file', fullPath, 'was deleted', previousStat)
                break
        }
    }
}