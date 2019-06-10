import DatabaseSDK from '../sdk/database/index';
import { Inject } from 'typescript-ioc';
import * as fs from 'fs';
import * as path from 'path';
import { Manifest } from '@project-sunbird/ext-framework-server/models';
import * as glob from 'glob';
import * as _ from 'lodash';
import Response from './../utils/response'
import { logger } from '@project-sunbird/ext-framework-server/logger';
import { containerAPI } from 'OpenRAP/dist/api';
export class ResourceBundle {
    // resourceBundleFiles
    @Inject
    private databaseSdk: DatabaseSDK;

    private fileSDK;
    constructor(manifest: Manifest) {
        this.databaseSdk.initialize(manifest.id);
        this.fileSDK = containerAPI.getFileSDKInstance(manifest.id);
    }

    public async insert() {
        let resourceBundleFiles = this.fileSDK.getAbsPath(path.join('data', 'resourceBundles', '**', '*.json'));
        let files = glob.sync(resourceBundleFiles, {});

        for (let file of files) {
            let bundles = await this.fileSDK.readJSON(file);
            let _id = path.basename(file, path.extname(file));
            let doc = _.get(bundles, 'result');
            await this.databaseSdk.upsert('resource_bundle', _id, doc).catch(err => {
                logger.error(`while upserting the ${_id} to channel database and err.message: ${err.message}`)
            });;
        }
    }

    get(req, res) {
        let id = req.params.id || 'en';
        logger.info(`Getting the data from resource_bundle database with id: ${id}`)
        this.databaseSdk.get('resource_bundle', id)
            .then(data => {
                data = _.omit(data, ['_id', '_rev'])
                logger.info(`Received data with id: ${id} in resource_bundle database`)
                return res.send(Response.success("api.resoucebundles.read", data));
            })
            .catch(err => {
                logger.error(`Received error while getting the data from resource_bundle database with id: ${id} and err.message: ${err.message}`)
                if (err.statusCode === 404) {
                    res.status(404)
                    return res.send(Response.error("api.resoucebundles.read", 404));
                } else {
                    let statusCode = err.statusCode || 500;
                    res.status(statusCode)
                    return res.send(Response.error("api.resoucebundles.read", statusCode));
                }
            });
    }

}