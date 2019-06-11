import { Inject } from "typescript-ioc";
import DatabaseSDK from "../sdk/database";
import * as _ from 'lodash';
import config from "./../config";
import Response from './../utils/response';
import { Manifest } from "@project-sunbird/ext-framework-server/models";
import { logger } from '@project-sunbird/ext-framework-server/logger';

import { TelemetryService } from "../services";


export default class Telemetry {

    @Inject
    private telemetryService: TelemetryService;

    @Inject
    private databaseSdk: DatabaseSDK;


    constructor(manifest: Manifest) {
        this.databaseSdk.initialize(manifest.id);
    }

    addEvents(req, res) {
        let events = req.body.events;
        if (_.isArray(events) && events.length) {
            this.telemetryService.addEvents(events).then(data => {
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

    registerDevice(req, res) {
        let deviceInfo = _.get(req, 'body.request');
        if (!_.isEmpty(deviceInfo)) {
            // try to update the deviceInfo
            this.databaseSdk.upsert('config', 'deviceInfo', deviceInfo)
                .then(data => {
                    return res.send(Response.success('api.device.registry', {}));
                })
                .catch(async (error) => {
                    logger.error('Error while updating the device info to db', error);
                    return res.send(Response.error('api.device.registry', 500));
                });

        } else {
            res.status(400);
            return res.send(Response.error('api.device.registry', 400));
        }
    }
}