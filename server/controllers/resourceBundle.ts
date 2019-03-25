import DatabaseSDK from '../sdk/database/index';
import { Inject } from 'typescript-ioc';
import * as fs from 'fs';
import * as path from 'path';
import { Manifest, BaseServer } from '@project-sunbird/ext-framework-server/models';
import * as glob from 'glob';
export class ResourceBundle {
    // resourceBundleFiles
    @Inject
    private databaseSdk: DatabaseSDK;
    constructor(manifest: Manifest) {
        this.databaseSdk.initialize(manifest.id);

    }
     resourceBundleFiles = path.join(__dirname, '..', 'data', 'resourceBundles', '**', '*.json');
     files = glob.sync(this.resourceBundleFiles, {});

    public insert() {
        this.files.forEach(element => {
            let response = fs.readFileSync(element);
            this.databaseSdk.insert('resourcebundle', `${element}`, response);

        });
    }

}