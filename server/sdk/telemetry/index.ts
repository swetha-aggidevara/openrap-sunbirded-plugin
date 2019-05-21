/**
 * @author Harish Kumar Gangula <harishg@ilimi.in>
 */

/**
* This SDK helps in plugins in registering  and adding event(s) and force syncing events with pluginId
* 
*/

import { Inject, Singleton } from "typescript-ioc";
import DatabaseSDK from "../database";
import isOnline from 'is-online';
import * as path from 'path';
import { logger } from "@project-sunbird/ext-framework-server/logger";
import FileSDK from "OpenRAP/dist/sdks/FileSDK";
import { containerAPI } from 'OpenRAP/dist/api';
import * as _ from 'lodash';
import * as stream from 'stream';
import uuid = require("uuid");
import * as zlib from 'zlib';
import * as fs from 'fs';
import { async } from "rxjs/internal/scheduler/async";
import config from "../../config";
import axios from 'axios';
import * as jwt from 'jsonwebtoken';

@Singleton
export default class TelemetrySDK {

    private pluginId: string;
    // private syncURL: string = process.env.API_URL + process.env.TELEMETRY_SYNC_URL;

    private telemetryFolderPath: string;
    @Inject
    private fileSDK: FileSDK;

    @Inject
    private databaseSdk: DatabaseSDK;

    initialize(pluginId: string) {
        this.pluginId = pluginId;
        // this.periodicArchiver();
        // this.periodicSync();
        this.databaseSdk.initialize(pluginId)
        const fileSDK = containerAPI.getFileSDKInstance(pluginId);
        // this.fileSDK.mkdir('telemetryArchive')
        this.telemetryFolderPath = this.fileSDK.getAbsPath(path.join('data', 'telemetry'));
    }


    addEvents(events: object[]) {
        // Add the events to database
        return this.databaseSdk.bulk('telemetry', events)

        //  TODO: Check the events count is greater or equal to the sync batch size if yes create gzip
        // if gzip created delete the events

        // if not having required docs skip the gzip
    }


    // below method prepares the batch of events periodically every 4 hour by default it is can be configured

    // private periodicArchiver() {
    //     let interval = parseInt(process.env.TELEMETRY_ARCHIVE_INTERVAL, 10)
    //     const gzip = zlib.createGzip();
    //     setInterval(() => {
    //         this.databaseSdk.list('telemetry', { include_docs: true })
    //             .then(data => {
    //                 let docs = data.rows;
    //                 // create the the batches of each with TELEMETRY BATCH SIZE
    //                 let batches = [], size = parseInt(process.env.TELEMETRY_BATCH_SIZE, 10);
    //                 while (docs.length > 0) {
    //                     batches.push(docs.splice(0, size));
    //                 }

    //                 batches.forEach(async (batch) => {
    //                     // prepare data for gzip
    //                     let batchClone = _.cloneDeep(batch);
    //                     batchClone = _.map(batchClone, batchItem => batchItem.doc)
    //                     batchClone = _.map(batchClone, (item) => {
    //                         return _.omit(item, ['_id', '_rev']);
    //                     })
    //                     let telemetryObj = {
    //                         "id": "api.telemetry",
    //                         "ver": "1.0",
    //                         "ts": Date.now(),
    //                         "params": {
    //                             "did": "", // TODO: NEED ADD THIS
    //                             "msgid": uuid.v4(),
    //                             "key": "",
    //                             "requesterId": ""
    //                         },
    //                         "events": batchClone
    //                     }
    //                     zlib.gzip(JSON.stringify(telemetryObj), (error, result) => {
    //                         if (error) {
    //                             logger.error('While creating gzip object for telemetry object');
    //                         } else {
    //                             let filePath = path.join(this.telemetryFolderPath, 'telemetry.' + uuid.v4() + '.' + Date.now() + '.gz');
    //                             let wstream = fs.createWriteStream(filePath);
    //                             wstream.write(result);
    //                             wstream.end();
    //                             wstream.on('finish', async () => {
    //                                 logger.info(batchClone.length + ' events are wrote to file ' + filePath + ' and  deleting events from telemetry database')
    //                                 let docs = _.map(batch, (event) => {
    //                                     return ({
    //                                         _id: event.doc._id,
    //                                         _rev: event.doc._rev,
    //                                         _deleted: true
    //                                     });
    //                                 })
    //                                 await this.databaseSdk.bulk('telemetry', docs).catch(err => {
    //                                     logger.error('While deleting the telemetry batch events  from database after creating zip', err);
    //                                 })

    //                             })
    //                         }

    //                     })

    //                 })
    //             }).catch(err => {
    //                 logger.error("Fetching the telemetry events from the database for archive", err);
    //             })

    //     }, interval * 60 * 1000)
    // }

    // This method try to sync the data to syncUrl from gzip files from Telemetry folder and 
    // after successful sync of they will be moved to telemetry archieve folder
    // private periodicSync() {
    //     let interval = parseInt(process.env.TELEMETRY_SYNC_INTERVAL, 10)
    //     setInterval(() => {
    //         // check if system is online
    //         isOnline().then((online: boolean) => {
    //             if (online) {

    //                 this.sync().catch(err => {
    //                     logger.error('Error while syncing the events', err);
    //                 })
    //             }
    //         })
    //     }, (interval * 60 * 1000))

    // }

    // Force sync the telemetry
    // async sync() {

    //     // get device id

    //     // get the token 

    //     // check api token exists

    //     // if not call register api to get the key and secret

    //     // create token with the 

    //     // get the  list of gzip files



    //     // sync the gzip files to end point

    //     // move the successfully synced gzip to telemetry-archive



    //     let doc = await this.databaseSdk.get('config', 'deviceInfo').catch(err => {
    //         logger.error('while getting device info from database', err.message);
    //         throw Error(err);
    //     });

    //     let APIToken = await this.getAPIToken(doc['did']);

    //     fs.readdir(this.telemetryFolderPath, async (err, files) => {
    //         if (err) {
    //             logger.error('Error while reading gzip files from telemetry folder ', err)
    //         } else {
    //             //filtering file so that only gz files are taken
    //             let filteredFiles = _.filter(files, (file) => {
    //                 return _.endsWith(file, '.gz');
    //             })
    //             let headers = {
    //                 "Authorization": `Bearer ${APIToken}`,
    //                 "Content-Type": "gzip"
    //             }
    //             for (let file of filteredFiles) {
    //                 await axios.post(
    //                     (process.env.API_URL + process.env.TELEMETRY_SYNC_URL),
    //                     fs.createReadStream(path.join(this.telemetryFolderPath, file)),
    //                     { headers: headers }
    //                 ).then(async (response) => {

    //                     // after syncing telemetry moving file to archive  folder
    //                     await this.fileSDK.move(path.join('data', 'telemetry', file), path.join('data', 'telemetryArchive', file)).catch(err => {
    //                         logger.error(`while moving file ${file} to archive folder after successful sync`);
    //                     })
    //                     logger.debug(`successfully synced telemetry of the file ${file}. ${JSON.stringify(response.data)}`)
    //                 }).catch(err => {
    //                     logger.error("While syncing the telemetry when once", err);
    //                 })
    //             }
    //         }
    //     });

    // }

    // async getAPIToken(deviceId: string) {

    //     let deviceTokenDoc = await this.databaseSdk.get('config', 'device_token').catch(err => {
    //         logger.error('while getting device token', err);
    //     });
    //     if (_.get(deviceTokenDoc, 'api_key')) {
    //         return _.get(deviceTokenDoc, 'api_key');
    //     } else {
    //         let token = Buffer.from(config.get('token'), 'base64').toString('ascii');
    //         if (token && deviceId) {
    //             let headers = {
    //                 'Content-Type': 'application/json',
    //                 'Authorization': `Bearer ${token}`
    //             }
    //             let body = {
    //                 "id": "api.device.register",
    //                 "ver": "1.0",
    //                 "ts": Date.now(),
    //                 "request": {
    //                     "key": deviceId
    //                 }
    //             }

    //             let response = await axios.post(process.env.API_URL + process.env.DEVICE_REGISTRY_URL, body, { headers: headers })
    //                 .catch(err => {
    //                     logger.error(`Error while registering the device status ${err.response.status} data ${err.response.data}`);
    //                     throw Error(err.message);
    //                 });
    //             let key = _.get(response, 'data.result.key');
    //             let secret = _.get(response, 'data.result.secret');
    //             let apiKey = jwt.sign({ "iss": key }, secret, { algorithm: 'HS256' })
    //             await this.databaseSdk.insert('config', { api_key: apiKey }, 'device_token').catch(err => {
    //                 logger.error('while inserting the api key to the  database', err);
    //             })
    //             return apiKey;

    //         } else {
    //             throw Error(`token or deviceID missing to register device ${deviceId}`)
    //         }
    //     }
    // }
}
