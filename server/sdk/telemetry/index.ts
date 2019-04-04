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
import FileSDK from "../file";
import * as _ from 'lodash';
import * as stream from 'stream';
import uuid = require("uuid");
import * as zlib from 'zlib';
import * as fs from 'fs';
import { async } from "rxjs/internal/scheduler/async";

@Singleton
export default class TelemetrySDK {

    private pluginId: string;
    private syncURL: string = process.env.API_URL + process.env.TELEMETRY_SYNC_URL;

    private telemetryFolderPath: string;
    @Inject
    private fileSDK: FileSDK;

    @Inject
    private databaseSdk: DatabaseSDK;

    initialize(pluginId: string) {
        this.pluginId = pluginId;
        this.periodicArchiver();
        this.periodicSync();
        this.databaseSdk.initialize(pluginId)
        this.fileSDK.initialize(pluginId);
        this.fileSDK.createFolder([path.join('data', 'telemetry')])
        this.fileSDK.createFolder([path.join('data', 'telemetryArchive')])
        this.telemetryFolderPath = this.fileSDK.geAbsolutePath(path.join('data', 'telemetry'));
    }


    addEvents(events: object[]) {
        // Add the events to database
        return this.databaseSdk.bulk('telemetry', events)

        //  TODO: Check the events count is greater or equal to the sync batch size if yes create gzip
        // if gzip created delete the events

        // if not having required docs skip the gzip
    }


    // below method prepares the batch of events periodically every 4 hour by default it is can be configured

    private periodicArchiver() {
        let interval = parseInt(process.env.TELEMETRY_ARCHIVE_INTERVAL, 10)
        const gzip = zlib.createGzip();
        setInterval(() => {
            this.databaseSdk.list('telemetry', { include_docs: true })
                .then(data => {
                    let docs = data.rows;
                    // create the the batches of each with TELEMETRY BATCH SIZE
                    let batches = [], size = parseInt(process.env.TELEMETRY_BATCH_SIZE, 10);
                    while (docs.length > 0) {
                        batches.push(docs.splice(0, size));
                    }

                    batches.forEach(async (batch) => {
                        // prepare data for gzip
                        let batchClone = _.cloneDeep(batch);
                        batchClone = _.map(batchClone, batchItem => batchItem.doc)
                        batchClone = _.map(batchClone, (item) => {
                            return _.omit(item, ['_id', '_rev']);
                        })
                        let telemetryObj = {
                            "id": "api.telemetry",
                            "ver": "1.0",
                            "ts": Date.now(),
                            "params": {
                                "did": "", // TODO: NEED ADD THIS
                                "msgid": uuid.v4(),
                                "key": "",
                                "requesterId": ""
                            },
                            "events": batchClone
                        }
                        zlib.gzip(JSON.stringify(telemetryObj), (error, result) => {
                            if (error) {
                                logger.error('While creating gzip object for telemetry object');
                            } else {
                                let filePath = path.join(this.telemetryFolderPath, 'telemetry.' + uuid.v4() + '.' + Date.now() + '.gz');
                                let wstream = fs.createWriteStream(filePath);
                                wstream.write(result);
                                wstream.end();
                                wstream.on('finish', async () => {
                                    logger.info(batchClone.length + ' events are wrote to file ' + filePath + ' and  deleting events from telemetry database')
                                    let docs = _.map(batch, (event) => {
                                        return ({
                                            _id: event.doc._id,
                                            _rev: event.doc._rev,
                                            _deleted: true
                                        });
                                    })
                                    await this.databaseSdk.bulk('telemetry', docs).catch(err => {
                                        logger.error('While deleting the telemetry batch events  from database after creating zip', err);
                                    })

                                })
                            }

                        })

                    })
                }).catch(err => {
                    logger.error("Fetching the telemetry events from the database for archive", err);
                })

        }, interval * 60 * 1000)
    }

    // This method try to sync the data to syncUrl from gzip files from Telemetry folder and 
    // after successful sync of they will be moved to telemetry archieve folder
    private periodicSync() {
        let interval = parseInt(process.env.TELEMETRY_SYNC_INTERVAL, 10)
        setInterval(() => {
            isOnline().then((online: boolean) => {
                if (online) {
                    fs.readdir(this.telemetryFolderPath, async (err, files) => {
                        if (err) {
                            logger.error('Error while reading gzip files from telemetry folder ', err)
                        } else {
                            //filtering file so that only gz files are taken
                            let filteredFiles = _.filter(files, (file) => {
                                return _.endsWith(file, '.gz');
                            })

                            logger.info('files list', filteredFiles)
                        }
                    });
                }
            })
        }, (interval * 60 * 1000))

        // check if system is online

        // get the  list of gzip files

        // sync the gzip files to end point

        // move the successfully synced gzip to telemetry-archive

    }

    // Force sync the telemetry
    sync(pluginId) {

    }
}
