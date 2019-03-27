import DatabaseSDK from '../sdk/database/index';
import { Manifest } from '@project-sunbird/ext-framework-server/models';

import { Inject } from 'typescript-ioc';
import * as path from 'path';
import * as glob from 'glob';
import FileSDK from './../sdk/file';
import * as _ from "lodash";
import * as uuid from "uuid";
import Response from "./../utils/response";

export class Form {

    @Inject
    private databaseSdk: DatabaseSDK;

    @Inject
    private fileSDK: FileSDK;

    constructor(manifest: Manifest) {
        this.databaseSdk.initialize(manifest.id);

    }
    public insert() {
        let formFiles = path.join(__dirname, '..', 'data', 'forms', '**', '*.json');
        let files = glob.sync(formFiles, {});

        files.forEach(async (file) => {
            let form = await this.fileSDK.readJSON(file);
            let doc = _.get(form, 'result.form');

            doc.rootOrgId = doc.rootOrgId || "*";
            doc.component = doc.component || "*";
            doc.framework = doc.framework || "*";
            let _id = uuid.v4();
            //TODO: handle multipe inserts of same form
            await this.databaseSdk.insert('form', doc, _id);
        });
    }

    search(req, res) {

        let requestBody = req.body;
        let requestObj = _.get(requestBody, 'request')
        requestObj = {
            type: requestObj.type,
            subtype: requestObj.subType,
            action: requestObj.action
        }
        // TODO: Need tp handle all the cases with rootOrg and framework and component
        //requestObj.rootOrgId = requestObj.rootOrgId || '*';
        //requestObj.component = requestObj.component || '*';
        //requestObj.framework = requestObj.framework || '*';

        let searchObj = {
            selector: requestObj
        }
        this.databaseSdk.find('form', searchObj)
            .then(data => {
                data = _.map(data.docs, doc => _.omit(doc, ['_id', '_rev']))
                if (data.length <= 0) {
                    res.status(404);
                    return res.send(Response.error("api.form.read", 404));
                }
                let resObj = {
                    form: data[0]
                }
                return res.send(Response.success("api.form.read", resObj));
            })
            .catch(err => {
                console.log(err)
                if (err.statusCode === 404) {
                    res.status(404)
                    return res.send(Response.error("api.form.read", 404));
                } else {
                    let statusCode = err.statusCode || 500;
                    res.status(statusCode)
                    return res.send(Response.error("api.form.read", statusCode));
                }
            });
    }
}