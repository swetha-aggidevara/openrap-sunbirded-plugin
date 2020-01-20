import { logger } from "@project-sunbird/ext-framework-server/logger";
import { Manifest } from "@project-sunbird/ext-framework-server/models";
import { HTTPService } from "@project-sunbird/ext-framework-server/services";
import * as _ from "lodash";
import { containerAPI } from "OpenRAP/dist/api";
import * as os from "os";
import config from "../config";
import Response from "../utils/response";

const systemInfo = {
    x32: "32bit",
    ia32: "32bit",
    x64: "64bit",
    ppc64: "64bit",
    s390: "64bit",
    s390x: "64bit",
    win32: "windows",
    linux: "linux",
};

export default class Appupdate {
    private deviceId;

    constructor(manifest: Manifest) {
        this.getDeviceId(manifest);
    }

    public async getDeviceId(manifest) {
        this.deviceId = await containerAPI.getSystemSDKInstance(manifest.id).getDeviceId();
    }
    public async getDesktopAppUpdate(req, res) {
        try {
            const data = await this.checkForUpdate();
            logger.info(`ReqId = "${req.headers["X-msgid"]}": result: ${data} found from desktop app update api`);
            return res.send(Response.success("api.desktop.update", _.get(data, "data.result"), req));
        } catch (err) {
            logger.error(`ReqId = "${req.headers["X-msgid"]}": Received error while processing desktop app update request where err = ${err}`);
            res.status(500);
            return res.send(Response.error("api.desktop.update", 500));
        }
    }

    public async getAppInfo(req, res) {
            logger.debug(`ReqId = "${req.headers["X-msgid"]}": getAppInfo() is called`);
            const data = await this.checkForUpdate().catch((error) =>
            logger.error(`error while checking for update ${error.message} ${error.status}`));
            return res.send(Response.success("api.app.info", {
                termsOfUseUrl: `${process.env.TERMS_OF_URL}/termsandcond/terms-and-conditions-v4.html`,
                version: process.env.APP_VERSION,
                releaseDate: process.env.RELEASE_DATE,
                deviceId: this.deviceId,
                languages: config.get("LANGUAGES"),
                updateInfo: _.get(data, "data.result"),
            }, req ));
    }

    private async checkForUpdate(): Promise<any> {
            const body = {
                request: {
                    appVersion: process.env.APP_VERSION,
                    os: systemInfo[os.platform()],
                    arch: systemInfo[os.arch()],
                },
            };
            const appConfig = {
                headers: {
                    "authorization": `Bearer ${process.env.APP_BASE_URL_TOKEN}`,
                    "content-type": "application/json",
                },
            };
            return HTTPService.post(`${process.env.APP_BASE_URL}/api/desktop/v1/update`, body, appConfig)
            .toPromise();
    }
}
