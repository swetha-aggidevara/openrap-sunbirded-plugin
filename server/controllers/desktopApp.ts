import Response from "./../utils/response";
import * as request from "request";
import { logger } from '@project-sunbird/ext-framework-server/logger';
import * as _ from 'lodash';
import * as os from 'os';

const systemInfo = {
    x32: '32bit',
    x64: '64bit',
    win32: 'windows',
    linux: 'linux'
};

export default class DesktopApp {

    constructor() { }

    async getDesktopAppUpate(req, res) {
        let body = {
            "request": {
                "appVersion": process.env.APP_VERSION,
                "os": systemInfo[os.platform()],
                "arch": systemInfo[os.arch()]
            }
        };

        var httpOptions = {
            url: `${process.env.APP_BASE_URL}desktop/v1/update`,
            headers: req.headers,
            method: 'POST',
            body: body,
            json: true
        }
        request(httpOptions, function (err, httpResponse, body) {
            if (err) {
                logger.error(`ReqId = "${req.headers['X-msgid']}": Received error while processing desktop app update request where err = ${err}`);
                res.status(500)
                return res.send(Response.error("api.desktop.update", 500))
            } else {
                logger.info(`ReqId = "${req.headers['X-msgid']}": result: ${_.get(body, 'result')} found from desktop app update api`);
                return res.send(Response.success('api.desktop.update', _.get(body, 'result'), req));
            }
        })
    }
}