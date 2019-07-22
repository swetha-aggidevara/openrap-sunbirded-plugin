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
        logger.debug(`ReqId = "${req.headers['X-msgid']}": Called telemetry addEvents method`);
        logger.info(`ReqId = "${req.headers['X-msgid']}": req.body.events, ${req.body.events.toString()}`);
        let events = req.body.events;
        if (_.isArray(events) && events.length) {
            logger.debug(`ReqId = "${req.headers['X-msgid']}": telemetry service is called to add telemetryEvents`)
            this.telemetryService.addEvents(events).then(data => {
                logger.info(`ReqId = "${req.headers['X-msgid']}": Telemetry events added successfully`)
                return res.send(Response.success('api.telemetry', {}));
            }).catch(err => {
                logger.error(`ReqId = "${req.headers['X-msgid']}": Received error while inserting events to telemetry db and err.message: ${err.message} `);
                res.status(500);
                return res.send(Response.error('api.telemetry', 500));
            });
        } else {
            logger.error(`ReqId = "${req.headers['X-msgid']}": Received err and err.res.status: 400`);
            res.status(400);
            return res.send(Response.error('api.telemetry', 400));
        }
    }

    registerDevice(req, res) {
        logger.debug(`ReqId = "${req.headers['X-msgid']}": registerDevice method is called`);
        let deviceInfo = _.get(req, 'body.request');
        if (!_.isEmpty(deviceInfo)) {
            // try to update the deviceInfo
            logger.debug(`ReqId = "${req.headers['X-msgid']}": Register the deviceInfo in database`);
            this.databaseSdk.upsert('config', 'deviceInfo', deviceInfo)
                .then(data => {
                    logger.info(`ReqId = "${req.headers['X-msgid']}": registered deviceInfo successfully`)
                    return res.send(Response.success('api.device.registry', {}));
                })
                .catch(async (error) => {
                    logger.error(`ReqId = "${req.headers['X-msgid']}": Received error while updating the device info from db before inserting and and err.message: ${error.message}`);
                    return res.send(Response.error('api.device.registry', 500));
                });

        } else {
            logger.error(`ReqId = "${req.headers['X-msgid']}": Received err and err.res.status: 400`)
            res.status(400);
            return res.send(Response.error('api.device.registry', 400));
        }
    }
}