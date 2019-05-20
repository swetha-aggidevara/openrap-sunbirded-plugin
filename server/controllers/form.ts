import DatabaseSDK from '../sdk/database/index';
import { Manifest } from '@project-sunbird/ext-framework-server/models';

import { Inject } from 'typescript-ioc';
import * as path from 'path';
import * as glob from 'glob';
import FileSDK from "OpenRAP/dist/sdks/FileSDK";
import * as _ from "lodash";
import * as uuid from "uuid";
import Response from "./../utils/response";
import * as Hashids from 'hashids';
import { logger } from '@project-sunbird/ext-framework-server/logger';

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
            let idText = `${doc.type}_${doc.subtype}_${doc.action}_${doc.rootOrgId}_${doc.framework}_${doc.component}`;
            let hash = new Hashids(idText, 10);
            let _id = hash.encode(1).toLowerCase();
            //TODO: handle multiple inserts of same form
            await this.databaseSdk.upsert('form', _id, doc).catch(err => {
                logger.error(`while upserting the ${idText} to form database ${err.message} ${err.reason}`)
            });
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