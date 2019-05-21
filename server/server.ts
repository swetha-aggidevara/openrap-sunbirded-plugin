
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
import TelemetrySDK from './sdk/telemetry';
import { containerAPI } from 'OpenRAP/dist/api';
import FileSDK from "OpenRAP/dist/sdks/FileSDK";

export class Server extends BaseServer {

    private sunbirded_plugin_initialized = false;
    private ecarsFolderPath: string = 'ecars';
    private contentFilesPath: string = 'content';
    private telemetryArchievedFolderPath: string = 'telemetry_archived';

    @Inject
    private databaseSdk: DatabaseSDK;
    @Inject
    private contentManager: ContentManager;

    @Inject
    private fileSDK: FileSDK

    @Inject
    private telemetrySDK: TelemetrySDK;

    constructor(manifest: Manifest) {
        super(manifest);

        // Added timeout since db creation is async and it is taking time and insertion is failing
        this.initialize(manifest).catch(err => {
            logger.error("Error while initializing open rap sunbird ed plugin", err);
            this.sunbirded_plugin_initialized = true;
        })
    }

    async initialize(manifest: Manifest) {
        const pluginConfig = {
            pluginVer: manifest.version,
            apiToken: '',
            apiBaseURL: '',
            apiTokenRefreshFn: ''
        }
        await containerAPI.register(manifest.id, pluginConfig);

        const fileSDK = containerAPI.getFileSDKInstance(manifest.id);

        await this.fileSDK.mkdir(this.contentFilesPath)
        await this.fileSDK.mkdir(this.ecarsFolderPath)
        await this.fileSDK.mkdir(this.telemetryArchievedFolderPath)

        this.databaseSdk.initialize(manifest.id);
        this.telemetrySDK.initialize(manifest.id);

        await this.insertConfig(manifest);

        /* used to listen for content added to ecars folder and unzip them to 
            content
            and inserts metadata to content database
        */
        config.set('content_files_path', fileSDK.getAbsPath(this.contentFilesPath))
        config.set('ecars_path', fileSDK.getAbsPath(this.ecarsFolderPath))
        this.contentManager.initialize(manifest.id,
            fileSDK.getAbsPath(this.contentFilesPath),
            fileSDK.getAbsPath(this.ecarsFolderPath))

        frameworkAPI.registerStaticRoute(fileSDK.getAbsPath(this.contentFilesPath), '/contentPlayer/preview/content_files');
        frameworkAPI.registerStaticRoute(fileSDK.getAbsPath(this.contentFilesPath), '/contentPlayer/preview/content_files/*/content-plugins');
        frameworkAPI.registerStaticRoute(path.join(__dirname, '..', '..', 'contentPlayer', 'preview'), '/contentPlayer/preview');
        frameworkAPI.registerStaticRoute(fileSDK.getAbsPath(this.contentFilesPath), '/content');
        frameworkAPI.registerStaticRoute(fileSDK.getAbsPath(this.ecarsFolderPath), '/ecars');
        frameworkAPI.registerStaticRoute(fileSDK.getAbsPath(this.telemetryArchievedFolderPath), '/telemetry_archived');
        frameworkAPI.registerStaticRoute(path.join(__dirname, '..', '..', 'portal'));
        frameworkAPI.registerStaticRoute(path.join(__dirname, '..', '..', 'sunbird-plugins'), '/sunbird-plugins');
        frameworkAPI.setStaticViewEngine('ejs')
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

