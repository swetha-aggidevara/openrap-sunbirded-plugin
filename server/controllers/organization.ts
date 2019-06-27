import DatabaseSDK from '../sdk/database/index';
import { Inject } from 'typescript-ioc';
import * as fs from 'fs';
import * as path from 'path';
import { Manifest, } from '@project-sunbird/ext-framework-server/models';
import * as glob from 'glob';
import * as _ from "lodash";
import Response from "./../utils/response";
import { logger } from '@project-sunbird/ext-framework-server/logger';
import { containerAPI } from 'OpenRAP/dist/api';

export class Organization {
    @Inject
    private databaseSdk: DatabaseSDK;

    private fileSDK;

    constructor(manifest: Manifest) {
        this.databaseSdk.initialize(manifest.id);
        this.fileSDK = containerAPI.getFileSDKInstance(manifest.id);
    }

    public async insert() {
        let organizationFiles = this.fileSDK.getAbsPath(path.join('data', 'organizations', '**', '*.json'));
        let files = glob.sync(organizationFiles, {});

        for (let file of files) {
            let organization = await this.fileSDK.readJSON(file);
            let _id = path.basename(file, path.extname(file));
            let doc = _.get(organization, 'result.response.content[0]');
            await this.databaseSdk.upsert('organization', _id, doc).catch(err => {
                logger.error(`Received error while upserting the ${_id} to channel database and err.message: ${err.message}`)
            });;
        }


    }

    search(req, res) {

        let requestBody = req.body;

        let searchObj = {
            selector: _.get(requestBody, 'request.filters')
        }
        logger.info(`Getting the data from organization database`)
        this.databaseSdk.find('organization', searchObj)
            .then(data => {
                data = _.map(data.docs, doc => _.omit(doc, ['_id', '_rev']))
                let resObj = {
                    response: {
                        content: data,
                        count: data.length
                    }
                }
                logger.info(`Received data from organization database`)
                return res.send(Response.success("api.org.search", resObj));
            })
            .catch(err => {
                logger.error(`Received error while searching in organization database and err.message: ${err.message} ${err}`)
                if (err.status === 404) {
                    res.status(404)
                    return res.send(Response.error("api.org.search", 404));
                } else {
                    let status = err.status || 500;
                    res.status(status)
                    return res.send(Response.error("api.org.search", status));
                }
            });
    }
}