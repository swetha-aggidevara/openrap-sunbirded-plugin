import { logger } from "@project-sunbird/ext-framework-server/logger";
import { Manifest } from "@project-sunbird/ext-framework-server/models";
import * as _ from "lodash";
import { containerAPI, ISystemQueueInstance } from "OpenRAP/dist/api";
import { Inject } from "typescript-ioc";
import DatabaseSDK from "../sdk/database";
import { ImportTelemetry } from "./../manager/telemetryImportManager/telemetryImport";
import { TelemetryImportManager } from "./../manager/telemetryImportManager/telemetryImportManager";
import Response from "./../utils/response";

export default class Telemetry {
  @Inject
  private databaseSdk: DatabaseSDK;
  private telemetrySDK;
  private systemQueue: ISystemQueueInstance;

  @Inject private telemetryImportManager: TelemetryImportManager;

  constructor(manifest: Manifest) {
    this.databaseSdk.initialize(manifest.id);
    this.telemetrySDK = containerAPI.getTelemetrySDKInstance();
    this.telemetryImportManager.initialize();
    this.systemQueue = containerAPI.getSystemQueueInstance(manifest.id);
  }

  public addEvents(req, res) {
    logger.debug(
      `ReqId = "${req.headers["X-msgid"]}": Called telemetry addEvents method`,
    );
    logger.info(
      `ReqId = "${req.headers["X-msgid"]}": adding telemetry events: ${req.body.events.length}`,
    );
    const events = req.body.events;
    if (_.isArray(events) && events.length) {
      logger.debug(
        `ReqId = "${req.headers["X-msgid"]}": telemetry service is called to add telemetryEvents`,
      );
      this.telemetrySDK
        .send(events)
        .then((data) => {
          logger.info(
            `ReqId = "${req.headers["X-msgid"]}": Telemetry events added successfully ${data}`,
          );
          return res.send(Response.success("api.telemetry", {}, req));
        })
        .catch((err) => {
          logger.error(
            `ReqId = "${req.headers["X-msgid"]}": Received error while inserting events to telemetry db and err.message: ${err.message} `,
          );
          res.status(500);
          return res.send(Response.error("api.telemetry", 500));
        });
    } else {
      logger.error(
        `ReqId = "${req.headers["X-msgid"]}": Received err and err.res.status: 400`,
      );
      res.status(400);
      return res.send(Response.error("api.telemetry", 400));
    }
  }

  public getInfo(req, res) {
    this.telemetrySDK.info((err, data) => {
      if (err) {
        res.status(err.status || 500);
        return res.send(Response.error("api.telemetry.info", err.status || 500
          , err.errMessage || err.message, err.code));
      }
      res.status(200);
      res.send(Response.success(`api.telemetry.info`, {
        response: data,
      }, req));
    });
  }

  public async getTelemetrySyncSetting(req, res) {
    logger.debug(`ReqId =  ${req.headers["X-msgid"]}: Get telemetry config to sync server is called`);
    try {
      const telemetryConfigData = await this.telemetrySDK.getTelemetrySyncSetting();
      res.status(200);
      return res.send(Response.success("api.telemetry.config.info",
      { response: telemetryConfigData }, req));
    } catch (err) {
      logger.error(
        `ReqId = "${req.headers[
        "X-msgid"
        ]}": Received error while getting telemetry config and err.message: ${err.message} ${err}`,
      );
      res.status(err.status || 500);
      return res.send(Response.error("api.telemetry.config.info", err.status || 500
        , err.errMessage || err.message, err.code));
    }
  }

  public async setTelemetrySyncSetting(req, res) {
    logger.debug(`ReqId =  ${req.headers["X-msgid"]}: Set Telemetry config to sync server is called`);
    try {
      const enable = _.get(req, "body.request.enable");
      if (enable === undefined || typeof enable !== "boolean") {
        res.status(400);
        return res.send(Response.error("api.telemetry.set.config", 400
        , "Enable key should exist and it should be boolean"));
      }
      await this.telemetrySDK.setTelemetrySyncSetting(enable);
      res.status(200);
      return res.send(Response.success("api.telemetry.set.config",
        { response: { message: "Successfully updated" } }, req));
    } catch (err) {
      logger.error(
        `ReqId = "${req.headers[
        "X-msgid"
        ]}": Received error while setting telemetry config and err.message: ${err.message} ${err}`,
      );
      res.status(err.status || 500);
      return res.send(Response.error("api.telemetry.set.config", err.status || 500
        , err.errMessage || err.message, err.code));
    }
  }

  public export(req, res) {
    const destFolder = req.query.destFolder;
    this.telemetrySDK.export(destFolder, (err, data) => {
      if (err) {
        res.status(err.status || 500);
        return res.send(Response.error("api.telemetry.export", err.status || 500, err.errMessage
          || err.message, err.code));
      }
      res.status(200);
      res.send(Response.success(`api.telemetry.export`, {
        response: data,
      }, req));
    });
  }

  public async import(req: any, res: any) {
    const filePaths = req.body;
    if (!filePaths) {
      return res.status(400).send(Response.error(`api.telemetry.import`, 400, "MISSING_FILE_PATHS"));
    }
    this.telemetryImportManager.add(filePaths).then((jobIds) => {
      res.send(Response.success("api.telemetry.import", {
        importedJobIds: jobIds,
      }, req));
    }).catch((err) => {
      res.status(500);
      res.send(Response.error(`api.telemetry.import`, 500, err.errMessage || err.message, err.code));
    });
  }

  public async retryImport(req: any, res: any) {
    this.telemetryImportManager.retryImport(req.params.importId).then((jobIds) => {
      res.send(Response.success("api.telemetry.import.retry", {
        jobIds,
      }, req));
    }).catch((err) => {
      res.status(500);
      res.send(Response.error(`api.telemetry.import.retry`, 400, err.message));
    });
  }

  public async list(req: any, res: any) {
    try {
      let dbData = await this.systemQueue.query({ type: ImportTelemetry.taskType });
      dbData = _.map(dbData.docs, (data) => ({
        id: _.get(data, "_id"),
        name: _.get(data, "name"),
        progress: _.get(data, "progress"),
        failedCode: _.get(data, "failedCode"),
        failedReason: _.get(data, "failedReason"),
        addedUsing: _.toLower(_.get(data, "type")),
        totalSize: _.get(data, "metaData.fileSize"),
        createdOn: _.get(data, "createdOn"),
        status: _.get(data, "status"),
      }));
      return res.send(Response.success("api.telemetry.list", {
        response: {
          count: dbData.length,
          items: _.orderBy(dbData, ["createdOn"], ["desc"]),
        },
      }, req));
    } catch (error) {
      logger.error(`ReqId = "${req.headers["X-msgid"]}": Error while processing the telemetry import list request and err.message: ${error.message}`);
      res.status(500);
      return res.send(Response.error("api.telemetry.list", 500));
    }
  }
}
