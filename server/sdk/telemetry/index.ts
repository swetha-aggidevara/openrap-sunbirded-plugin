/**
 * @author Harish Kumar Gangula <harishg@ilimi.in>
 */

/**
* This SDK helps in plugins in registering  and adding event(s) and force syncing events with pluginId
* 
*/
export default class TelemetrySDK {

    private pluginId: string;
    private syncURL: string;

    initialize(pluginId: string, syncURL: string) {
        this.pluginId = pluginId;
        this.syncURL = syncURL;
    }

    addEvent(pluginId: string, event: object) {
        //TODO: need to push event to persistent storage
    }

    addEvents(pluginId, events: object[]) {
        //TODO: need to push event to persistent storage
    }

    sync(pluginId) {
        //TODO: try to sync if the internet connection is available
    }

}
