/**
 * @author Harish Kumar Gangula <harishg@ilimi.in>
 */
import { frameworkAPI } from '@project-sunbird/ext-framework-server/api';
import { logger } from '@project-sunbird/ext-framework-server/logger';
/**
* This SDK helps in performing operations with database and to create them
* 
*/
export default class DatabaseSDK {

    private pluginId: string;
    private url: string;
    private dbInstances: object;


    initialize(pluginId: string, url?: string) {
        this.pluginId = pluginId;
        this.url = url;
    }

    get(database: string, Id: string) {
        let db = frameworkAPI.getPouchDBInstance(this.pluginId, database);
        return db.get(Id);
    }

    insert(database: string, doc: any, Id?: string) {
        let db = frameworkAPI.getPouchDBInstance(this.pluginId, database);
        if (Id) {
            doc._id = Id;
            return db.put(doc);
        }
        return db.post(doc);
    }

    async update(database: string, docId, doc) {
        let db = frameworkAPI.getPouchDBInstance(this.pluginId, database);
        let docResponse = await db.get(docId);
        let result = await db.put({ ...docResponse, ...doc });
        return result;
    }

    async delete(database: string, docId) {
        let db = frameworkAPI.getPouchDBInstance(this.pluginId, database);
        let doc = await db.get(docId);
        let result = await db.remove(doc._id, doc._rev);
        return result;
    }

    find(database: string, searchObj: Object) {
        let db = frameworkAPI.getPouchDBInstance(this.pluginId, database);
        return db.find(searchObj);
    }

    bulk(database: string, documents: Object[]) {
        let db = frameworkAPI.getPouchDBInstance(this.pluginId, database);
        return db.bulkDocs(documents);
    }

    list(database: string, options: Object) {
        let db = frameworkAPI.getPouchDBInstance(this.pluginId, database);
        return db.allDocs(options);
    }

    async upsert(database: string, docId: string, doc: any) {
        logger.info(` Doc is  upserting with docID: ${docId} in database: ${database}`)
        let db = frameworkAPI.getPouchDBInstance(this.pluginId, database);
        let docNotFound = false;
        let docResponse = await db.get(docId).catch(err => {
            logger.error(`Received Error while upserting data to database: ${database} and err: ${err}`);
            if (err.status === 404) {
                docNotFound = true;
            } else {
                // if error is not doc not found then throwing error 
                throw Error(err)
            }
        });
        let result;
        if (docNotFound) {
            doc._id = docId;
            result = await db.put(doc);
        } else {
            result = await db.put({ ...docResponse, ...doc });
        }

        return result;
    }
}
