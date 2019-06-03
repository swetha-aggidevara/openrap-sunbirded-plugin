import DatabaseSDK from '../sdk/database/index';
import { Manifest } from '@project-sunbird/ext-framework-server/models';

import { Inject } from 'typescript-ioc';
import * as path from 'path';
import * as glob from 'glob';
import * as _ from "lodash";
import Response from './../utils/response'
import { logger } from '@project-sunbird/ext-framework-server/logger';
import { containerAPI } from 'OpenRAP/dist/api';

export class Framework {


    @Inject
    private databaseSdk: DatabaseSDK;

    private fileSDK;

    constructor(manifest: Manifest) {
        this.databaseSdk.initialize(manifest.id);
        this.fileSDK = containerAPI.getFileSDKInstance(manifest.id);
    }
    public async insert() {
        let frameworkFiles = this.fileSDK.getAbsPath(path.join('data', 'frameworks', '**', '*.json'));
        let files = glob.sync(frameworkFiles, {});

        for (let file of files) {
            let framework = await this.fileSDK.readJSON(file);
            let _id = path.basename(file, path.extname(file));
            let doc = _.get(framework, 'result.framework');
            await this.databaseSdk.upsert('framework', _id, doc).catch(err => {
                logger.error(`while upserting the ${_id} to framework database ${err.message} ${err.reason}`)
            });;
        };
    }

    get(req: any, res: any): any {
        let id = req.params.id;
        this.databaseSdk.get('framework', id)
            .then(data => {
                data = _.omit(data, ['_id', '_rev'])
                let resObj = {
                    framework: data
                }
                return res.send(Response.success("api.framework.read", resObj));
            })
            .catch(err => {

                if (err.statusCode === 404) {
                    res.status(404)
                    return res.send(Response.error("api.framework.read", 404));
                } else {
                    let statusCode = err.statusCode || 500;
                    res.status(statusCode)
                    return res.send(Response.error("api.framework.read", statusCode));
                }
            });
    }
}