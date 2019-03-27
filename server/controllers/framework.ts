import DatabaseSDK from '../sdk/database/index';
import { Manifest } from '@project-sunbird/ext-framework-server/models';

import { Inject } from 'typescript-ioc';
import * as path from 'path';
import * as glob from 'glob';
import FileSDK from './../sdk/file';
import * as _ from "lodash";
import Response from './../utils/response'

export class Framework {


    @Inject
    private databaseSdk: DatabaseSDK;

    @Inject
    private fileSDK: FileSDK;

    constructor(manifest: Manifest) {
        this.databaseSdk.initialize(manifest.id);

    }
    public insert() {
        let frameworkFiles = path.join(__dirname, '..', 'data', 'frameworks', '**', '*.json');
        let files = glob.sync(frameworkFiles, {});

        files.forEach(async (file) => {
            let framework = await this.fileSDK.readJSON(file);
            let _id = path.basename(file, path.extname(file));
            let doc = _.get(framework, 'result.framework');
            await this.databaseSdk.insert('framework', doc, _id);
        });
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