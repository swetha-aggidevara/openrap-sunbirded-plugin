import { Inject } from "typescript-ioc";
import DatabaseSDK from "../sdk/database";
import * as _ from 'lodash';
import config from "./../config";
import Response from './../utils/response';
import { Manifest } from "@project-sunbird/ext-framework-server/models";
import { logger } from "../logger";
import isOnline from 'is-online';


export default class Telemetry {


    @Inject
    private databaseSdk: DatabaseSDK;

    constructor(manifest: Manifest) {
        this.databaseSdk.initialize(manifest.id)
        this.startSyncInterval()
    }
    addEvents(req, res) {
        let events = req.body.events;
        if (_.isArray(events) && events.length) {
            let eventsStatus = _.map(events, e => {
                e.syncStatus = false;
                return e;
            })
            this.databaseSdk.bulk('telemetry', eventsStatus).then(data => {
                return res.send(Response.success('api.telemetry', {}));
            }).catch(err => {
                logger.error('Error while inserting events to telemetry db', JSON.stringify(err));
                res.status(500);
                return res.send(Response.error('api.telemetry', 500));
            });
        } else {
            res.status(400);
            return res.send(Response.error('api.telemetry', 400));
        }
    }
    startSyncInterval(): any {
        let interval = parseInt(config.get('TELEMETRY_SYNC_INTERVAL'), 10)
        let batchSize = parseInt(config.get('TELEMETRY_BATCH_SIZE'), 10)
        setInterval(() => {
            isOnline().then((online: boolean) => {
                if (online) {
                    this.databaseSdk.find('telemetry', {
                        selector: {
                            syncStatus: false,
                            limit: batchSize
                        }
                    }).then(events => {
                        // TODO: need to implement sync call
                    }).catch(err => {
                        logger.error("Error while fetching events from telemetry db to sync when connected", err);
                    })
                }
            })

        }, (interval * 60 * 1000))
    }
}