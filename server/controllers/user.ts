import Response from "../utils/response";
import { logger } from '@project-sunbird/ext-framework-server/logger';
import * as _ from 'lodash';
import { containerAPI } from "OpenRAP/dist/api";

export default class User {
    private userSDK;
    constructor() {
        this.userSDK = containerAPI.getUserSdkInstance();
    }

    async create(req, res) {
        try {
            const createResp = await this.userSDK.create(_.get(req, 'body.request'));
            logger.info(`ReqId = "${req.headers['X-msgid']}": request: ${_.get(req, 'body.request')} found from desktop app update api`);
            return res.send(Response.success('api.desktop.user.create', { id: createResp._id }, req));
        } catch (err) {
            logger.error(`ReqId = "${req.headers['X-msgid']}": Received error while adding user,  where err = ${err}`);
            res.status(err.status || 500);
            return res.send(
                Response.error("api.content.update", err.status, err.message || '')
            );
        }
    }

    async read(req, res) {
        try {
            const userData = await this.userSDK.read();
            logger.info(`ReqId = "${req.headers['X-msgid']}": result: ${userData} found from desktop app update api`);
            return res.send(Response.success('api.desktop.user.read', userData, req));
        } catch (err) {
            logger.error(`ReqId = "${req.headers['X-msgid']}": Received error while getting user,  where err = ${err}`);
            res.status(err.status || 500);
            return res.send(
                Response.error("api.content.update", err.status, err.message || '')
            );
        }
    }
}
