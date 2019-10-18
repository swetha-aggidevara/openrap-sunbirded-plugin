import Response from "./../utils/response";
import { logger } from "@project-sunbird/ext-framework-server/logger";
export default class Tenant {
  get(req, res) {
    logger.debug(`ReqId = "${req.headers["X-msgid"]}": Getting Tenant Info`);
    let resObj = {
      appLogo: "/appLogo.png",
      favicon: "/favicon.ico",
      logo: "/logo.png",
      titleName: process.env.APP_NAME
    };
    logger.info(`ReqId = "${req.headers["X-msgid"]}": Received Tenant Info`);
    res.send(Response.success("api.tenant.info", resObj, req));
  }
}
