
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
import DatabaseSDK from './sdk/database';

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
        this.initialize(manifest).catch(err => {
            console.log("Error while initializing open rap sunbird ed plugin", err);
        })
    }



    async initialize(manifest: Manifest) {

        this.insertConfig(manifest)
        await this.insertConfig(manifest)





        //registerAcrossAllSDKS()
        this.fileSDK.initialize(manifest.id);


        await this.setupDirectories()

        /* used to listen for content added to downloads folder and unzip them to 
            content_files
            and inserts metadata to content database
        */
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
    insertConfig(manifest: Manifest) {
        const framework = new Framework(manifest);
        const organization = new Organization(manifest);

        const page = new Page(manifest);

        const resourceBundle = new ResourceBundle(manifest);

        this.databaseSdk.initialize(manifest.id);
        framework.insert();
        organization.insert();
        page.insert();
        resourceBundle.insert();
    }


    private async insertConfig(manifest: Manifest) {

    }
}

