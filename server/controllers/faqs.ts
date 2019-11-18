import DatabaseSDK from "../sdk/database/index";
import { Inject } from "typescript-ioc";
import * as path from "path";
import { Manifest } from "@project-sunbird/ext-framework-server/models";
import * as glob from "glob";
import * as _ from "lodash";
import Response from "./../utils/response";
import { logger } from "@project-sunbird/ext-framework-server/logger";
import { containerAPI } from "OpenRAP/dist/api";
import { HTTPService } from "@project-sunbird/ext-framework-server/services";
const FAQS_DB = 'faqs';
const FAQ_BLOB_URL = `${process.env.FAQ_BLOB_URL}`;

export class Faqs {

  @Inject private databaseSdk: DatabaseSDK;
  private fileSDK;
  private faqsBasePath;
  constructor(manifest: Manifest) {
      this.databaseSdk.initialize(manifest.id);
      this.fileSDK = containerAPI.getFileSDKInstance(manifest.id);
      this.faqsBasePath = this.fileSDK.getAbsPath(path.join("data", "faqs"));
  }
  public async insert() {
    let files = glob.sync(path.join(this.faqsBasePath, "**", "*.json"), {});
    logger.log('--Inserting faqs to db--', files);
    for (let file of files) {
      let faqsData: IFaqsData = await this.fileSDK.readJSON(file);
      let _id = path.basename(file, path.extname(file));
      await this.addToDb(_id, faqsData);
    }
  }
  public async read(req, res){
    const language = req.params.language;
    logger.info(`Got Faqs read request for language:`, req.params.language, `for ReqId: ${req.get('x-msgid')}`);
    let faqs = await this.fetchOnlineFaqs(language, req) || await this.fetchOfflineFaqs(language, req);
    if(faqs){
      res.send(Response.success("api.faqs.read", { faqs }, req));
    } else {
      logger.error(`Got error while fetching Faq for language: `, language, `for ReqId: ${req.get('x-msgid')} `);
      res.status(404).send(Response.error("api.faqs.read", 404));
    }
  }
  async fetchOfflineFaqs(language, req): Promise<IFaqsData | undefined > {
    logger.info(`Getting faqs from db for language:`, language, `for ReqId: ${req.get('x-msgid')}`);
    let faqsData: IFaqsData = await this.databaseSdk.get(FAQS_DB, language).then(doc => doc.data).catch(err => {
      logger.error(`Got error while reading Faq from DB for language`, language, `for ReqId: ${req.get('x-msgid')}, error message `, err.message);
      return undefined;
    });
    if(!faqsData){ // Load from files. Not needed as we have inserted all faqs json on app start.
      logger.info(`Getting faqs from file system for language:`, language, `for ReqId: ${req.get('x-msgid')}`);
      faqsData = await this.fileSDK.readJSON(path.join(this.faqsBasePath, language + ".json")).catch(err => {
        logger.error(`Got error while reading Faq from file for language`, language, `for ReqId: ${req.get('x-msgid')}, error message `, err.message);
        return undefined;
      })
    }
    return faqsData;
  }
  async fetchOnlineFaqs(language, req): Promise<IFaqsData  | undefined > {
    logger.info(`Getting faqs from blob for language:`, language, `for ReqId: ${req.get('x-msgid')}`);
    const config = {
      headers: {
          "authorization": `Bearer ${process.env.APP_BASE_URL_TOKEN}`, // not needed unless it being proxed 
          "content-type": "application/json"
      }
    };
    return await HTTPService.get(`${FAQ_BLOB_URL}faq-${language}.json`, config).toPromise()
    .then((data: any) => {
      const faqsData = _.get(data, 'data');
      if(faqsData){
        this.addToDb(language, faqsData);
      }
      return faqsData;
    }).catch(err => {
      logger.error(`Got error while reading Faq from blob for language`, language, `for ReqId: ${req.get('x-msgid')}, error message `, err.message);
      return undefined;
    });
  }
  private async addToDb(_id: string, data: IFaqsData){
    await this.databaseSdk.upsert(FAQS_DB, _id, { data })
    .catch(err => logger.error(`Received error while insert/updating faqs for language: ${_id} to faqs database and err.message: ${err.message}`));
  }
}

export interface IFaqs {
  topic: string;
  description: string;
}
export interface IFaqsData {
  faqs: Array<IFaqs>;
  constants: Object;
}
