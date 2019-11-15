import DatabaseSDK from "../sdk/database/index";
import { Inject } from "typescript-ioc";
import * as fs from "fs";
import * as path from "path";
import { Manifest } from "@project-sunbird/ext-framework-server/models";
import * as glob from "glob";
import * as _ from "lodash";
import Response from "./../utils/response";
import { logger } from "@project-sunbird/ext-framework-server/logger";
import { containerAPI } from "OpenRAP/dist/api";
import { HTTPService } from "@project-sunbird/ext-framework-server/services";


export class Location {
    // locationFiles
    @Inject
    private databaseSdk: DatabaseSDK;

    private fileSDK;
    constructor(manifest: Manifest) {
        this.databaseSdk.initialize(manifest.id);
        this.fileSDK = containerAPI.getFileSDKInstance(manifest.id);
    }

    public async insert() {

        let statesFile = this.fileSDK.getAbsPath(
            path.join("data", "location", "state.json")
        );
        let stateBundle = await this.fileSDK.readJSON(statesFile);
        let states = _.get(stateBundle, 'result.response');
        let districtFiles = this.fileSDK.getAbsPath(path.join("data", "location", "**", "*.json"));
        let districts = glob.sync(districtFiles, {});
        for (let state of states) {
            for (let district of districts) {
                let districtBundle = await this.fileSDK.readJSON(district);
                let _id = path.basename(district, path.extname(district));
                if (_.includes(_id, state.id)) {
                    state['data'] = _.get(districtBundle, 'result.response') || [];
                }
            }
        }
        await this.databaseSdk
            .upsert("location", 'state', stateBundle)
            .catch(err => {
                logger.error(
                    `while upserting the state to location database  ${err}`
                );
            });
    }

    async search(req, res) {
        logger.debug(
            `ReqId = "${req.headers["X-msgid"]}": Location search method is called`
        );
        let requestBody = req.body;
        let locationType = _.get(requestBody, "request.filters.type");
        let parentId = _.get(requestBody, "request.filters.parentId");
        logger.debug(
            `ReqId = "${req.headers["X-msgid"]}": Finding the data from location database`
        );

        if ((locationType === 'district' && _.isEmpty(parentId)) || (locationType === 'state' && !_.isEmpty(parentId))) {
            const error = locationType === 'district' && _.isEmpty(parentId) ? 'parentId is missing' : 'parentId is not required';
            logger.error(
                `ReqId = "${req.headers["X-msgid"]}": Error Received while searching ${locationType} data error: ${error}`
            );
            res.status(400);
            return res.send(Response.error("api.location.read", 400, error));
        }

        if (locationType === 'district') {
            await this.getAllDistricts(locationType, parentId).then(response => {
                let resObj = {
                    response: response
                };
                logger.info(
                    `ReqId = "${req.headers["X-msgid"]}": Received data  location - location database`
                );
                return res.send(Response.success("api.location.read", resObj, req));
            }).catch(err => {
                logger.error(
                    `ReqId = "${req.headers["X-msgid"]}": Received error while searching in location database and err.message: ${err.message} ${err}`
                );
                if (err.status === 404) {
                    res.status(404);
                    return res.send(Response.error("api.location.read", 404));
                } else {
                    let status = err.status || 500;
                    res.status(status);
                    return res.send(Response.error("api.location.read", status));
                }
            });

        }

        else {
            await this.getAllStates(locationType).then(response => {
                let resObj = {
                    response: response
                };
                logger.info(
                    `ReqId = "${req.headers["X-msgid"]}": Received data  location - location database`
                );
                return res.send(Response.success("api.location.read", resObj, req));
            }).catch(err => {
                logger.error(
                    `ReqId = "${req.headers["X-msgid"]}": Received error while searching in location database and err.message: ${err.message} ${err}`
                );
                if (err.status === 404) {
                    res.status(404);
                    return res.send(Response.error("api.location.read", 404));
                } else {
                    let status = err.status || 500;
                    res.status(status);
                    return res.send(Response.error("api.location.read", status));
                }
            });
        }


    }

    async getLocationData(type, parentId?) {

        let locationData = await this.fetchLocationFromOnline(type, parentId).catch(error => {
            return error;
        });

        if (_.isEmpty(locationData)) {
            locationData = await this.fetchLocationFromOffline().catch(error => {
                return error;
            })
        }

        return locationData;

    }

    async fetchLocationFromOnline(type, parentId?) {
        const config = {
            headers: {
                "authorization": `Bearer ${process.env.APP_BASE_URL_TOKEN}`,
                "content-type": "application/json"
            }
        };
        const filter = _.isEmpty(parentId) ? { filters: { type: type } } : { filters: { type: type, parentId: parentId } }
        const requestParams = {
            request: filter
        };
        try {
            let onlineData = await HTTPService.post(`${process.env.APP_BASE_URL}/api/data/v1/location/search`, requestParams, config).toPromise();
            // await this.updateLocationInDb(onlineData.data);
            return onlineData;
        } catch (error) {
            return undefined;
        }
    }

    async fetchLocationFromOffline() {
        return await this.databaseSdk.find("location", { selector: {} }).catch(error => { return error })
    }

    // async updateLocationInDb(onlineData) {
    //     let offlineData = await this.fetchLocationFromOffline();
    //     offlineData = _.get(offlineData, 'docs[0].result.response');
    //     onlineData = _.get(onlineData, 'data.result.response');
    //     let filteredData = _.forEach(onlineData, (data) => {
    //         _.filter(offlineData, {id: data.id});
    //     })
    // }

    async getAllStates(type){
        let allStates = await this.getLocationData(type).catch(err => {
            return err;
        });
        allStates = !_.isEmpty(_.get(allStates, 'data')) ? _.get(allStates, 'data.result.response') : _.get(allStates, 'docs[0].result.response');
        for (let state of allStates) {
            if (_.has(state, 'data')) {
                delete state['data'];
            }
        }
        return allStates;
    }

    async getAllDistricts(type, parentId) {
        let allDistricts = await this.getLocationData(type, parentId).catch(err => {
            return err;
        });
        allDistricts = !_.isEmpty(_.get(allDistricts, 'data')) ? _.filter(_.get(allDistricts, 'data.result.response'), { parentId: parentId }) : _.filter(_.get(allDistricts, 'docs[0].result.response'), { id: parentId });
        return allDistricts;
    }
}
