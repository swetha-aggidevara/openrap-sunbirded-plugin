import { ILocation } from './ILocation';
import DatabaseSDK from '../sdk/database/index';
import { Inject } from 'typescript-ioc';
import * as fs from 'fs';
import * as path from 'path';
import { Manifest } from '@project-sunbird/ext-framework-server/models';
import * as glob from 'glob';
import * as _ from 'lodash';
import Response from './../utils/response';
import { logger } from '@project-sunbird/ext-framework-server/logger';
import { containerAPI } from 'OpenRAP/dist/api';
import { HTTPService } from '@project-sunbird/ext-framework-server/services';

export class Location {
    @Inject private databaseSdk: DatabaseSDK;

    private fileSDK;
    constructor(manifest: Manifest) {
        this.databaseSdk.initialize(manifest.id);
        this.fileSDK = containerAPI.getFileSDKInstance(manifest.id);
    }

    // Inserting states and districts data from files

    public async insert() {
        logger.debug(`Location insert method is called`);
        let filesPath = this.fileSDK.getAbsPath(path.join('data', 'location', '/'));
        let stateFile = await this.fileSDK.readJSON(filesPath + 'state.json');
        let states = _.get(stateFile, 'result.response');
        logger.info(`states and district data is inserting in db`);
        for (let state of states) {
            let districtFile = await this.fileSDK.readJSON(filesPath + 'district-' + state.id + '.json');
            state['data'] = _.get(districtFile, 'result.response') || [];
            await this.InsertLocationData(state.id, state);
        }
    }
    //  Updating and inserting states and district to location db
    async InsertLocationData(id, locationData: ILocation) {
        logger.debug(`InsertLocationData method is called`);
        let stateData = await this.databaseSdk.get('location', id).catch(error => {
            logger.error(`while getting the data from  database: LOCATION ${error}`);
        });

        if (!_.isEmpty(stateData) && locationData.type === 'district' && _.isEmpty(_.find(stateData['data'], { id: locationData.id }))) {
            stateData['data'].push(locationData);
            await this.databaseSdk.update('location', id, stateData).catch(err => {
                logger.error(`while updating the state to location database  ${err}`);
            });
        }

        if (_.isEmpty(stateData) && locationData.type === 'state') {
            await this.databaseSdk.upsert('location', id, locationData).catch(err => {
                logger.error(`while upserting the state to location database  ${err}`);
            });
        }
    }
    // Searching location data in DB (if user is in online get online data and insert in db)
    async search(req, res) {
        logger.debug(`ReqId = '${req.headers['X-msgid']}': Location search method is called`);
        let requestBody = {
            locationType: _.get(req.body, 'request.filters.type'),
            parentId: _.get(req.body, 'request.filters.parentId'),
        };
        logger.debug(`ReqId = '${req.headers['X-msgid']}': Finding the data from location database`);

        if (
            (requestBody.locationType === 'district' && _.isEmpty(requestBody.parentId)) ||
            (requestBody.locationType === 'state' && !_.isEmpty(requestBody.parentId))
        ) {
            const error =
                requestBody.locationType === 'district' && _.isEmpty(requestBody.parentId)
                    ? 'requestBody.parentId is missing'
                    : 'requestBody.parentId is not required';
            logger.error(
                `ReqId = '${req.headers[
                'X-msgid'
                ]}': Error Received while searching ${requestBody.locationType} data error: ${error}`
            );
            res.status(400);
            return res.send(Response.error('api.location.read', 400, error));
        }
        logger.debug(`ReqId = ${req.headers['X-msgid']}: getLocationData method is calling`);
        await this.getLocationData(req.headers['X-msgid'], requestBody.locationType, requestBody.parentId).then(response => {
            response = _.map(response['docs'], (doc: ILocation) => requestBody.locationType === 'state' ? _.omit(doc, ['_id', '_rev', 'data']) : _.omit(doc, ['_id', '_rev']));

            let resObj = {
                response: response
            }
            logger.info(`ReqId =  ${req.headers['X-msgid']}: got data from db`);
            return res.send(Response.success('api.location.read', resObj, req));
        }).catch(err => {
            logger.error(
                `ReqId = "${req.headers[
                'X-msgid'
                ]}": Received error while searching in location database and err.message: ${err.message} ${err}`
            );
            if (err.status === 404) {
                res.status(404);
                return res.send(Response.error('api.location.read', 404));
            } else {
                let status = err.status || 500;
                res.status(status);
                return res.send(Response.error('api.location.read', status));
            }
        })
    }
    // Gets location data from online and inserts in db 
    async getLocationData(msgId, type, parentId?) {
        logger.info(`ReqId =  ${msgId}: getLocationdata method is called`);
        const config = {
            headers: {
                authorization: `Bearer ${process.env.APP_BASE_URL_TOKEN}`,
                'content-type': 'application/json',
            },
        };
        const filter = _.isEmpty(parentId)
            ? { filters: { type: type } }
            : { filters: { type: type, parentId: parentId } };

        const requestParams = {
            request: filter,
        };

        return new Promise(async (resolve, reject) => {
            let offlineData: Array<ILocation>;
            try {
                logger.debug(`ReqId =  ${msgId}: getting location data from online`);
                let responseData = await HTTPService.post(
                    `${process.env.APP_BASE_URL}/api/data/v1/location/search`,
                    requestParams,
                    config
                ).toPromise();
                logger.debug(`ReqId =  ${msgId}: fetchLocationFromOffline method is calling `);
                offlineData = await this.fetchLocationFromOffline(msgId, parentId, _.get(responseData, 'data.result.response'));
                resolve(offlineData);
            } catch (err) {
                logger.debug(`ReqId =  ${msgId}: fetchLocationFromOffline method is calling `);
                offlineData = await this.fetchLocationFromOffline(msgId, parentId);
                resolve(offlineData);
            }
        });
    }

    // Searching location in Db with user applied filters
    async fetchLocationFromOffline(msgId, parentId, onlineLocationData?) {
        logger.debug(`ReqId =  ${msgId}: fetchLocationFromOffline method is called `);
        if (!_.isEmpty(onlineLocationData)) {
            logger.info(`ReqId =  ${msgId}: Inserting online location  data in db`);
            _.map(onlineLocationData, async (onlineData: ILocation) => {
                let id = _.get(onlineData, 'parentId') || onlineData.id;
                onlineData.type === 'state' && _.isEmpty(_.get(onlineData, 'data')) ? onlineData['data'] = [] : onlineData;
                await this.InsertLocationData(id, onlineData);
            });
        }
        const request = _.isEmpty(parentId) ? { selector: {} } : { selector: { id: parentId } };
        logger.info(`ReqId =  ${msgId}: finding data from location db`);
        return await this.databaseSdk.find('location', request);
    }
}
