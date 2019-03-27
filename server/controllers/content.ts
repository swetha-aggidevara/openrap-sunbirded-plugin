import { Inject } from "typescript-ioc";
import DatabaseSDK from "../sdk/database";
import * as _ from 'lodash';
import { manifest } from './../manifest';
import config from "./../config";
import Response from './../utils/response';

export default class Content {

    @Inject
    private databaseSdk: DatabaseSDK;

    constructor() {
        this.databaseSdk.initialize(manifest.id)
    }

    searchInDB(filters) {
        let modifiedFilters = _.mapValues(filters, (v) => ({ '$in': v }));
        let dbFilters = {
            selector: modifiedFilters,
            limit: parseInt(config.get('CONTENT_SEARCH_LIMIT'), 10)
        }
        return this.databaseSdk.find('content', dbFilters);
    }

    get(req: any, res: any): any {
        let id = req.params.id;
        this.databaseSdk.get('content', id)
            .then(data => {
                data = _.omit(data, ['_id', '_rev'])
                let resObj = {
                    content: data
                }
                return res.send(Response.success("api.content.read", resObj));
            })
            .catch(err => {

                if (err.statusCode === 404) {
                    res.status(404)
                    return res.send(Response.error("api.content.read", 404));
                } else {
                    let statusCode = err.statusCode || 500;
                    res.status(statusCode)
                    return res.send(Response.error("api.content.read", statusCode));
                }
            });
    }

}