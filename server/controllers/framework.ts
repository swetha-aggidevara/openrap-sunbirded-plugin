import DatabaseSDK from "../sdk/database/index";
import { Manifest } from "@project-sunbird/ext-framework-server/models";

import { Inject } from "typescript-ioc";
import * as path from "path";
import * as glob from "glob";
import * as _ from "lodash";
import Response from "./../utils/response";
import { logger } from "@project-sunbird/ext-framework-server/logger";
import { containerAPI } from "OpenRAP/dist/api";

export class Framework {
  @Inject
  private databaseSdk: DatabaseSDK;

  private fileSDK;

  constructor(manifest: Manifest) {
    this.databaseSdk.initialize(manifest.id);
    this.fileSDK = containerAPI.getFileSDKInstance(manifest.id);
  }
  public async insert() {
    let frameworkFiles = this.fileSDK.getAbsPath(
      path.join("data", "frameworks", "**", "*.json")
    );
    let files = glob.sync(frameworkFiles, {});

    for (let file of files) {
      let framework = await this.fileSDK.readJSON(file);
      let _id = path.basename(file, path.extname(file));
      let doc = _.get(framework, "result.framework");
      await this.databaseSdk.upsert("framework", _id, doc).catch(err => {
        logger.error(
          `Received error while upserting the ${_id} to framework database err.message: ${err.message}`
        );
      });
    }
  }

  get(req: any, res: any): any {
    logger.debug(
      `ReqId = "${req.headers["X-msgid"]}": Getting Framework data for framework with Id: ${req.params.id}`
    );
    let id = req.params.id;
    logger.info(
      `ReqId = "${req.headers["X-msgid"]}": Getting the data from framework database with id: ${id}`
    );
    this.databaseSdk
      .get("framework", id)
      .then(data => {
        logger.info(
          `ReqId = "${req.headers["X-msgid"]}": Received data with id: ${id} from framework database`
        );
        data = _.omit(data, ["_id", "_rev"]);
        let resObj = {
          framework: data
        };
        return res.send(Response.success("api.framework.read", resObj, req));
      })
      .catch(err => {
        logger.error(
          `ReqId = "${req.headers["X-msgid"]}": Received error while getting the data from framework database with id: ${id} and err.message: ${err.message} ${err}`
        );
        if (err.status === 404) {
          res.status(404);
          return res.send(Response.error("api.framework.read", 404));
        } else {
          let status = err.status || 500;
          res.status(status);
          return res.send(Response.error("api.framework.read", status));
        }
      });
  }
}
