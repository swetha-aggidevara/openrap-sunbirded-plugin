import { EventManager } from '@project-sunbird/ext-framework-server/managers/EventManager';
import * as express from 'express';
import { frameworkAPI } from '@project-sunbird/ext-framework-server/api';
import { frameworkConfig } from './routes.spec.data';
import bodyParser = require('body-parser');
import * as _ from "lodash";
import { logger } from '@project-sunbird/ext-framework-server/logger';

export class ConnectToServer {
    expressApp = express();
    app;
    async startServer() {

        let subApp = express();

        const getFilesPath = () => {
            if (_.startsWith(_.toLower(process.env.APP_ID), "local")) {
                return __dirname;
            }
        };
        subApp.use(bodyParser.json({ limit: "100mb" }));
        this.expressApp.use("/", subApp);
        frameworkConfig.db.pouchdb.path = process.env.DATABASE_PATH;
        frameworkConfig["logBasePath"] = getFilesPath();
        await frameworkAPI
            .bootstrap(frameworkConfig, subApp);
        await new Promise((resolve, reject) => {
            this.app = this.expressApp.listen(process.env.APPLICATION_PORT, (error: any) => {
                if (error) {
                    logger.error('errrror', error);
                    reject(error);
                } else {
                    logger.info("app is started on port " + process.env.APPLICATION_PORT);
                    resolve();
                }
            });
        });
        await new Promise((resolve) => {
            EventManager.subscribe('openrap-sunbirded-plugin:initialized', () => {
                resolve()
            })
        });
        return this.expressApp;
    }

    close() {
        this.app.close(() => {
            logger.info(`Server Disconnected`);
        })
    }
}

