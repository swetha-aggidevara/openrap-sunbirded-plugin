import * as chokidar from 'chokidar';

export default class FolderWatcher {

    private watchers: any[] = [];
    private pluginId: string;

    initialize(pluginId) {
        this.pluginId = pluginId;
    }

    addWatcher(folderPath) {
        try {
            this.watchers[this.pluginId + '_' + folderPath] =
                chokidar.watch(folderPath, {
                    ignored: /(^|[\/\\])\../,
                    persistent: true
                });
        } catch (err) {
            console.log("Error while adding the watcher to ", folderPath)
        }

        return this.watchers[this.pluginId + '_' + folderPath];
    }

    removeWatcher(folderPath) {
        this.watchers[this.pluginId + '_' + folderPath].close()
    }
}