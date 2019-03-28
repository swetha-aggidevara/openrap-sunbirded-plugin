
import { Manifest, BaseServer } from '@project-sunbird/ext-framework-server/models';
import { frameworkAPI } from '@project-sunbird/ext-framework-server/api';
import * as path from 'path';
import { Inject } from 'typescript-ioc';
import ContentManager from './manager/ContentManager'
import FileSDK from './sdk/file';
import { Framework } from './controllers/framework';
import { Organization } from './controllers/organization';
import { Page } from './controllers/page';
import { ResourceBundle } from './controllers/resourceBundle';
import { Channel } from './controllers/channel';
import { Form } from './controllers/form';
import DatabaseSDK from './sdk/database';
import config from './config'
import { enableLogger } from './logger'

export class Server extends BaseServer {

    private sunbirded_plugin_initialized = false;
    private contentFilesPath: string = 'content_files';
    private downloadsFolderPath: string = 'downloads';

    @Inject
    private databaseSdk: DatabaseSDK;
    @Inject
    private contentManager: ContentManager;

    @Inject
    private fileSDK: FileSDK;

    constructor(manifest: Manifest) {
        super(manifest);

        // Added timeout since db creation is async and it is taking time and insertion is failing
        setTimeout(() => {
            this.initialize(manifest).catch(err => {
                console.log("Error while initializing open rap sunbird ed plugin", err);
            })
        }, 5000)

    }

    async initialize(manifest: Manifest) {

        this.insertConfig(manifest)

        // enable logger
        enableLogger('info');

        await this.insertConfig(manifest)


        //registerAcrossAllSDKS()
        this.fileSDK.initialize(manifest.id);
        this.databaseSdk.initialize(manifest.id);

        await this.setupDirectories()

        /* used to listen for content added to downloads folder and unzip them to 
            content_files
            and inserts metadata to content database
        */
        config.set('content_files_path', this.fileSDK.geAbsolutePath(this.contentFilesPath))
        config.set('downloads_path', this.fileSDK.geAbsolutePath(this.downloadsFolderPath))
        this.contentManager.initialize(manifest.id,
            this.fileSDK.geAbsolutePath(this.contentFilesPath),
            this.fileSDK.geAbsolutePath(this.downloadsFolderPath))

        frameworkAPI.registerStaticRoute(path.join(__dirname, this.contentFilesPath));

        frameworkAPI.registerStaticRoute(path.join(__dirname, '..', '..', 'portal'));
        frameworkAPI.setStaticViewEngine('ejs')


        //- reIndex()
        //- reConfigure()
    }

    private async setupDirectories() {
        await this.fileSDK.createFolder(this.contentFilesPath)
        await this.fileSDK.createFolder(this.downloadsFolderPath)
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

