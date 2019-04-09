import DatabaseSDK from '../sdk/database/index';
import { Inject } from 'typescript-ioc';
import * as fs from 'fs';
import * as path from 'path';
import { Manifest } from '@project-sunbird/ext-framework-server/models';
import * as glob from 'glob';
import FileSDK from './../sdk/file';
import * as _ from 'lodash';
import Response from './../utils/response'
import { logger } from '@project-sunbird/ext-framework-server/logger';
export class ResourceBundle {
    // resourceBundleFiles
    @Inject
    private databaseSdk: DatabaseSDK;

    @Inject
    private fileSDK: FileSDK
    constructor(manifest: Manifest) {
        this.databaseSdk.initialize(manifest.id);

    }

    public async insert() {
        let resourceBundleFiles = path.join(__dirname, '..', 'data', 'resourceBundles', '**', '*.json');
        let files = glob.sync(resourceBundleFiles, {});

        files.forEach(async (file) => {
            let bundles = await this.fileSDK.readJSON(file);
            let _id = path.basename(file, path.extname(file));
            let doc = _.get(bundles, 'result');
            await this.databaseSdk.upsert('resource_bundle', _id, doc).catch(err => {
                logger.error(`while upserting the ${_id} to channel database ${err.message} ${err.reason}`)
            });;
        });
    }

    get(req, res) {
        let id = req.params.id || 'en';
        this.databaseSdk.get('resource_bundle', id)
            .then(data => {
                data = _.omit(data, ['_id', '_rev'])
                return res.send(Response.success("api.resoucebundles.read", data));
            })
            .catch(err => {

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