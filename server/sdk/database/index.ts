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

    insert(database: string, doc: any, Id?: string) {
        if (Id) {
            return this.connection.db.use(database).insert(doc, Id);
        }
        return this.connection.db.use(database).insert(doc);
    }

    async update(database: string, docId, doc) {
        let db = this.connection.db.use(database);
        let docResponse = await db.get(docId);
        let result = await db.insert({ ...docResponse, ...doc });
        return result;
    }

    async delete(database: string, docId) {
        let db = this.connection.db.use(database);
        let doc = await db.get(docId);
        let result = await db.destroy(doc._id, doc._rev);
        return result;
    }

    createView(database: string, viewConfig) {
        return this.connection.db.use(database).insert(viewConfig)
    }

    createIndex(database: string, indexDef) {
        return this.connection.db.use(database).createIndex(indexDef);
    }

    find(database: string, searchObj: Object) {
        return this.connection.db.use(database).find(searchObj);
    }

    bulk(database: string, documents: Object[]) {
        return this.connection.db.use(database).bulk({ docs: documents });
    }

    list(database: string, options: Object) {
        return this.connection.db.use(database).list(options);
    }
}
