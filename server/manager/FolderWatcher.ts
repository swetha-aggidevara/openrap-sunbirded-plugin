import watchr from 'watchr';

export default class FolderWatcher {

    private watchers: any[] = [];
    private pluginId: string;

    initialize(pluginId) {
        this.pluginId = pluginId;
    }

    addWatcher(folderPath, listener, callback) {
        this.watchers[this.pluginId + '_' + folderPath] = watchr.open(folderPath, listener, callback)
    }

    removeWatcher(folderPath) {
        this.watchers[this.pluginId + '_' + folderPath].close()
    }
}