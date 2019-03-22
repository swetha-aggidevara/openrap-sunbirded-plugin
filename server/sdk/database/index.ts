/**
 * @author Harish Kumar Gangula <harishg@ilimi.in>
 */
import { frameworkAPI } from '@project-sunbird/ext-framework-server/api';

/**
* This SDK helps in performing operations with database and to create them
* 
*/
export default class DatabaseSDK {

    private pluginId: string;
    private url: string;
    private connection: any;

    initialize(pluginId: string, url?: string) {
        this.pluginId = pluginId;
        this.url = url;
        this.connection = frameworkAPI.getCouchDBInstance(this.pluginId);
    }

    createDatabase(database: string) {
        return this.connection.db.create(database);
    }

    get(database: string, Id: string) {
        return this.connection.db.use(database).get(Id);
    }

    insert(database: string, Id: string, doc: any) {
        return this.connection.db.use(database).insert(doc, Id);
    }

    async update(database, docId, doc) {
        let db = this.connection.use(database);
        let docResponse = db.get(docId);
        let result = await db.insert({ ...docResponse, ...doc });
        return result;
    }

    async delete(database, docId) {
        let db = this.connection.use(database);
        let doc = db.get(docId);
        let result = await db.destroy(doc._id, doc._rev);
        return result;
    }

    createView(database, viewConfig) {
        return this.connection.use(database).insert(viewConfig)
    }

    createIndex(database, indexDef) {
        this.connection.use(database).createIndex(indexDef);
    }
}
