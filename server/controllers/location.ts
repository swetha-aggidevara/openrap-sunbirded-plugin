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
        try {
            let filesPath = this.fileSDK.getAbsPath(path.join('data', 'location', '/'));
            let stateFile = await this.fileSDK.readJSON(filesPath + 'state.json');
            let states = _.get(stateFile, 'result.response');
            let allStates: Array<ILocation> = [];
            let allDocs = await this.databaseSdk.list('location', { include_docs: true, startkey: 'design_\uffff' });
            if (allDocs.rows.length === 0) {
                for (let state of states) {
                    state._id = state.id;
                    let districtFile = await this.fileSDK.readJSON(filesPath + 'district-' + state.id + '.json');
                    state['data'] = _.get(districtFile, 'result.response') || [];
                    allStates.push(state);
                }
                logger.debug('Inserting location data in locationDB')
                await this.databaseSdk.bulk('location', allStates).catch(err => {
                    logger.error(`while inserting location data in locationDB  ${err}`);
                });
            }
            return;
        } catch (err) {
            logger.error(`while inserting location data in locationDB  ${err}`);
            return;
        }
    }

    // Searching location data in DB (if user is in online get online data and insert in db)
    async search(req, res) {
        logger.debug(`ReqId = '${req.headers['X-msgid']}': Location search method is called`);
        let locationType = _.get(req.body, 'request.filters.type');
        let parentId = _.get(req.body, 'request.filters.parentId');
        logger.debug(`ReqId = '${req.headers['X-msgid']}': Finding the data from location database`);
        if (_.isEmpty(locationType)) {
            res.status(400);
            return res.send(Response.error('api.location.read', 400, 'location Type is missing'));
        }
        if (locationType === 'district' && _.isEmpty(parentId)) {
            logger.error(
                `ReqId = '${req.headers[
                'X-msgid'
                ]}': Error Received while searching ${locationType} data error: parentId is missing`
            );
            res.status(400);
            return res.send(Response.error('api.location.read', 400, 'parentId is missing'));
        }

        logger.debug(`ReqId = ${req.headers['X-msgid']}: getLocationData method is calling`);
        const request = _.isEmpty(parentId) ? { selector: {} } : { selector: { id: parentId } };
        await this.databaseSdk.find('location', request).then(response => {
            response = _.map(response['docs'], (doc) => locationType === 'state' ? _.omit(doc, ['_id', '_rev', 'data']) : doc.data);
            let resObj = {
                response: locationType === 'district' ? response[0] : response
            };
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
        });
    }
    async proxyToAPI(req, res, next) {

        let type = _.get(req.body, 'request.filters.type');
        let parentId = _.get(req.body, 'request.filters.parentId');

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
        try {
            logger.debug(`ReqId =  ${req.headers["X-msgid"]}}: getting location data from online`);
            let responseData = await HTTPService.post(
                `${process.env.APP_BASE_URL}/api/data/v1/location/search`,
                requestParams,
                config
            ).toPromise();

            let resObj = {
                response: _.get(responseData.data, 'result.response')
            }

            logger.debug(`ReqId =  ${req.headers["X-msgid"]}}: fetchLocationFromOffline method is calling `);
            await this.insertOnlineDataInDB(resObj, parentId, req.headers['X-msgid']);
            resObj.response = _.map(resObj.response, data => _.has(data, 'data') ? _.omit(data, 'data') : data);
            return res.send(Response.success('api.location.read', resObj, req));
        } catch (err) {
            logger.error(`Error Received while getting data from Online ${_.get(err, 'response')}`)
            next();
        }
    }

    async insertOnlineDataInDB(onlineData, parentId, msgId) {
        logger.debug(`ReqId =  ${msgId}: Inserting online data in db method is called`);
        let dataNotInDB: Array<ILocation> = [], dataInDB;
        onlineData = _.map(onlineData.response, data => {
            !_.has(data, 'data') && data.type === 'state' ? data['data'] = [] : '';
            return data;
        });
        logger.info(`ReqId =  ${msgId}: Finding  data in Location DB`);
        const request = _.isEmpty(parentId) ? { selector: {} } : { selector: { id: parentId } };
        let allDocs = await this.databaseSdk.find('location', request);
        logger.info(`ReqId =  ${msgId}: Data found in Location DB`);
        dataNotInDB = _.map(onlineData, (data) => { if (data.type === 'state' && _.isEmpty(_.find(allDocs.docs, { id: data.id }))) { return data } });
        _.map(onlineData, async data => {
            if (data.type === 'district') {
                dataInDB = _.find(allDocs.docs, { id: data.parentId });
                if (!_.find(dataInDB.data, { id: data.id })) {
                    dataInDB['data'].push(data);
                    let id = _.get(dataInDB, '_id');
                    await this.databaseSdk.update('location', id, dataInDB);
                }
            }
        });
        logger.info(`ReqId =  ${msgId}: Inserting  online data in Location DB`);
        if (dataNotInDB.length > 0 && !_.isEmpty(dataNotInDB[0])) { await this.databaseSdk.bulk('location', dataNotInDB); }
    }

}
