import DatabaseSDK from '../sdk/database/index';
import { Inject } from 'typescript-ioc';
import * as fs from 'fs';
import * as path from 'path';
import { Manifest, } from '@project-sunbird/ext-framework-server/models';
import * as glob from 'glob';
import FileSDK from '../sdk/file';
import * as _ from "lodash";
import Response from "./../utils/response";

export class Organization {
    @Inject
    private databaseSdk: DatabaseSDK;

    @Inject
    private fileSDK: FileSDK;

    constructor(manifest: Manifest) {
        this.databaseSdk.initialize(manifest.id);

    }

    public insert() {
        let organizationFiles = path.join(__dirname, '..', 'data', 'organizations', '**', '*.json');
        let files = glob.sync(organizationFiles, {});

        files.forEach(async (file) => {
            let organization = await this.fileSDK.readJSON(file);
            let _id = path.basename(file, path.extname(file));
            let doc = _.get(organization, 'result.response.content[0]');
            await this.databaseSdk.insert('organization', doc, _id);
        });
    }

    search(req, res) {

        let requestBody = req.body;

        let searchObj = {
            selector: _.get(requestBody, 'request.filters')
        }
        this.databaseSdk.find('organization', searchObj)
            .then(data => {
                data = _.map(data.docs, doc => _.omit(doc, ['_id', '_rev']))
                let resObj = {
                    response: {
                        content: data,
                        count: data.length
                    }
                }
                return res.send(Response.success("api.org.search", resObj));
            })
            .catch(err => {
                console.log(err)
                if (err.statusCode === 404) {
                    res.status(404)
                    return res.send(Response.error("api.org.search", 404));
                } else {
                    let statusCode = err.statusCode || 500;
                    res.status(statusCode)
                    return res.send(Response.error("api.org.search", statusCode));
                }
            });
    }
}