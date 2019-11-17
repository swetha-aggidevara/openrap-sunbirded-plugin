import DatabaseSDK from "../sdk/database/index";
import { Inject } from "typescript-ioc";
import * as fs from "fs";
import * as path from "path";
import { Manifest } from "@project-sunbird/ext-framework-server/models";
import * as glob from "glob";
import * as _ from "lodash";
import Response from "./../utils/response";
import { logger } from "@project-sunbird/ext-framework-server/logger";
import { containerAPI } from "OpenRAP/dist/api";
import { HTTPService } from "@project-sunbird/ext-framework-server/services";
const FAQS_DB = 'faqs';
const FAQ_BLOB_URL = 'http://localhost:3000/faqs/' || `${process.env.APP_BASE_URL}blob/faqs/`;

export class Faqs {

  @Inject private databaseSdk: DatabaseSDK;
  private fileSDK;
  constructor(manifest: Manifest) {
      this.databaseSdk.initialize(manifest.id);
      this.fileSDK = containerAPI.getFileSDKInstance(manifest.id);
  }
  public async insert() {
    let faqsFiles = this.fileSDK.getAbsPath(path.join("data", "faqs", "**", "*.json"));
    let files = glob.sync(faqsFiles, {});
    logger.log('--Inserting faqs to db--', files);
    for (let file of files) {
      let faqs = await this.fileSDK.readJSON(file);
      let _id = path.basename(file, path.extname(file));
      await this.addToDb(_id, _.get(faqs, 'faqs'));
    }
  }
  public async read(req, res){
    const language = req.params.language;
    logger.info(`Got Faqs read request for language:`, req.params.language, `for ReqId: ${req.get('x-msgid')}`);
    try {
      let faqs = await this.fetchOnlineFaqs(language, req) || await this.fetchOfflineFaqs(language, req);
      if(!faqs){
        throw { status : 404, message: 'Faqs not found for requested language'}
      }
      res.send(Response.success("api.faqs.read", { faqs }, req));
    } catch(err) {
      logger.error(`Got error while fetching Faq for language: `, language, `for ReqId: ${req.get('x-msgid')}, error message: `, err.message);
      let status = err.status || 500;
      res.status(status).send(Response.error("api.faqs.read", status));
    }
  }
  async fetchOfflineFaqs(language, req): Promise<Array<IFaqs> | undefined> {
    logger.info(`Getting faqs from db for language:`, language, `for ReqId: ${req.get('x-msgid')}`);
    return this.databaseSdk.get(FAQS_DB, language).then(doc => doc.data);
  }
  async fetchOnlineFaqs(language, req): Promise<Array<IFaqs>  | undefined> {
    logger.info(`Getting faqs from blob for language:`, language, `for ReqId: ${req.get('x-msgid')}`);
    const config = {
      headers: {
          "authorization": `Bearer ${process.env.APP_BASE_URL_TOKEN}`, // not needed unless it being proxed 
          "content-type": "application/json"
      }
    };
    return await HTTPService.get(`${FAQ_BLOB_URL}${language}.json`, config).toPromise()
    .then((data: any) => {
      const faqs = _.get(data, 'data.faqs');
      if(faqs){
        this.addToDb(language, faqs);
      }
      return faqs;
    }).catch(err => {
      logger.error(`Got error while reading Faq from blob for language`, language, `for ReqId: ${req.get('x-msgid')}, error message `, err.message);
      return undefined;
    });
  }
  private async addToDb(_id, data){
    let doc = {
      data
    };
    await this.databaseSdk.upsert(FAQS_DB, _id, doc)
    .catch(err => logger.error(`Received error while insert/updating the ${_id} to faqs database and err.message: ${err.message}`));
  }
}

export interface IFaqs {
  topic: string;
  description: string;
}

