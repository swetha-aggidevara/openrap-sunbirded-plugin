
import { Manifest, BaseServer } from '@project-sunbird/ext-framework-server/models';
import { frameworkAPI } from '@project-sunbird/ext-framework-server/api';
import * as path from 'path';
import { Inject } from 'typescript-ioc';
import ContentManager from './manager/ContentManager'
import FileSDK from './sdk/file';

export class Server extends BaseServer {

    private sunbirded_plugin_initialized = false;
    private contentFilesPath: string = 'content_files';
    private downloadsFolderPath: string = 'downloads';


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


    private async insertConfig(manifest: Manifest) {

    }
}

