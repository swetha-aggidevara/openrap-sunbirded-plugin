import * as uuid from "uuid";

export default class Response {
  static success(id, result, req) {
    // prepare success response object
    req.rid = id;
    let resObj = {
      id: id,
      ver: "1.0",
      ts: new Date().toISOString(),
      params: {
        resmsgid: uuid.v4(),
        msgid: uuid.v4(),
        status: "successful",
        err: null,
        errmsg: null
      },
      responseCode: "OK",
      result: result
    };
    return resObj;
  }

  static error(id, responseCode, errmsg?, errCode?) {
    // prepare error response object
    let resObj = {};
    if (responseCode === 404) {
      resObj = {
        id: id,
        ver: "1.0",
        ts: new Date().toISOString(),
        params: {
          resmsgid: uuid.v4(),
          msgid: uuid.v4(),
          status: "failed",
          err: errCode || "ERR_DATA_NOT_FOUND",
          errmsg: errmsg || "Data not found"
        },
        responseCode: "RESOURCE_NOT_FOUND",
        result: {}
      };
    } else if (responseCode === 400) {
      resObj = {
        id: id,
        ver: "1.0",
        ts: new Date().toISOString(),
        params: {
          resmsgid: uuid.v4(),
          msgid: uuid.v4(),
          status: "failed",
          err: errCode || "ERR_BAD_REQUEST",
          errmsg: errmsg || "Error while processing the request "
        },
        responseCode: "CLIENT_ERROR",
        result: {}
      };
    } else {
      resObj = {
        id: id,
        ver: "1.0",
        ts: new Date().toISOString(),
        params: {
          resmsgid: uuid.v4(),
          msgid: uuid.v4(),
          status: "failed",
          err: errCode || "ERR_INTERNAL_SERVER_ERROR",
          errmsg: errmsg || "Error while processing the request"
        },
        responseCode: "INTERNAL_SERVER_ERROR",
        result: {}
      };
    }
    return resObj;
  }
}
