
import { Manifest, BaseServer } from '@project-sunbird/ext-framework-server/models';
import { frameworkAPI } from '@project-sunbird/ext-framework-server/api';
import * as path from 'path';
import { Inject } from 'typescript-ioc';
import ContentManager from './manager/ContentManager'
import { Framework } from './controllers/framework';
import { Organization } from './controllers/organization';
import { Page } from './controllers/page';
import { ResourceBundle } from './controllers/resourceBundle';
import { Channel } from './controllers/channel';
import { Form } from './controllers/form';
import DatabaseSDK from './sdk/database';
import config from './config'
import { logger } from '@project-sunbird/ext-framework-server/logger';
import { containerAPI } from 'OpenRAP/dist/api';
import { addContentListener, reconciliation } from './controllers/content/contentHelper';
import { TelemetryService } from "./services";
import * as _ from 'lodash';

export class Server extends BaseServer {

    private sunbirded_plugin_initialized = false;
    private ecarsFolderPath: string = 'ecars';
    private contentFilesPath: string = 'content';
    private tempPath: string = 'temp';
    private telemetryArchivedFolderPath: string = 'telemetry_archived';

    @Inject
    private databaseSdk: DatabaseSDK;

    @Inject
    private telemetryService: TelemetryService;

    @Inject
    private contentManager: ContentManager;

    @Inject
    private fileSDK;

    constructor(manifest: Manifest) {
        super(manifest);

        // Added timeout since db creation is async and it is taking time and insertion is failing
        this.fileSDK = containerAPI.getFileSDKInstance(manifest.id);
        this.initialize(manifest).catch(err => {
            logger.error("Error while initializing open rap sunbird ed plugin", err);
            this.sunbirded_plugin_initialized = true;
        })


    }
    async initialize(manifest: Manifest) {
        await this.telemetryService.initialize(manifest.id);
        const pluginConfig = {
            pluginVer: manifest.version,
            apiToken: process.env.APP_BASE_URL_TOKEN,
            apiBaseURL: process.env.APP_BASE_URL,
            apiTokenRefreshFn: 'refreshToken'
        }
        await containerAPI.register(manifest.id, pluginConfig);

        await this.fileSDK.mkdir(this.contentFilesPath)
        await this.fileSDK.mkdir(this.ecarsFolderPath)
        await this.fileSDK.mkdir(this.telemetryArchivedFolderPath)

        //registerAcrossAllSDKS()
        this.databaseSdk.initialize(manifest.id);

        // listener to index content when content downloaded
        addContentListener(manifest.id);
        reconciliation(manifest.id)

        /* used to listen for content added to downloads folder and unzip them to 
            content_files
            and inserts metadata to content database
        */
        this.contentManager.initialize(manifest.id, this.fileSDK.getAbsPath(this.contentFilesPath),
            this.fileSDK.getAbsPath(this.ecarsFolderPath))

        frameworkAPI.registerStaticRoute(this.fileSDK.getAbsPath(this.contentFilesPath), '/contentPlayer/preview/content');
        frameworkAPI.registerStaticRoute(this.fileSDK.getAbsPath(this.contentFilesPath), '/contentPlayer/preview');
        frameworkAPI.registerStaticRoute(this.fileSDK.getAbsPath(this.contentFilesPath), '/contentPlayer/preview/content/*/content-plugins');
        frameworkAPI.registerStaticRoute(path.join(__dirname, '..', '..', 'public', 'contentPlayer', 'preview'), '/contentPlayer/preview');
        frameworkAPI.registerStaticRoute(this.fileSDK.getAbsPath(this.contentFilesPath), '/content');
        frameworkAPI.registerStaticRoute(this.fileSDK.getAbsPath(this.ecarsFolderPath), '/ecars');
        frameworkAPI.registerStaticRoute(this.fileSDK.getAbsPath(this.tempPath), '/temp');
        frameworkAPI.registerStaticRoute(path.join(__dirname, '..', '..', 'public', 'portal'));
        frameworkAPI.registerStaticRoute(path.join(__dirname, '..', '..', 'public', 'sunbird-plugins'), '/sunbird-plugins');
        frameworkAPI.setStaticViewEngine('ejs')

        // insert meta data for app
        await this.insertConfig(manifest)
        //- reIndex()
        //- reConfigure()
    }

    private async insertConfig(manifest: Manifest) {
        const framework = new Framework(manifest);
        const organization = new Organization(manifest);
        const page = new Page(manifest);
        const resourceBundle = new ResourceBundle(manifest);
        const channel = new Channel(manifest);
        const form = new Form(manifest);

        resourceBundle.insert();
        framework.insert();
        organization.insert();
        channel.insert();
        form.insert();
        page.insert();

    }

}

process
    .on('unhandledRejection', (reason, p) => {
        logger.error(reason, 'Unhandled Rejection at Promise', p);
    })
    .on('uncaughtException', err => {
        logger.error(err, 'Uncaught Exception thrown');
        process.exit(1);
    });

