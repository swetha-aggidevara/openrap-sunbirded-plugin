import DatabaseSDK from '../sdk/database/index';
import { Inject } from 'typescript-ioc';
import * as fs from 'fs';
import * as path from 'path';
import { Manifest, BaseServer } from '@project-sunbird/ext-framework-server/models';
export class Organization {
    @Inject
    private databaseSdk: DatabaseSDK;
    constructor(manifest: Manifest) {
       this.databaseSdk.initialize(manifest.id);

    }

    public insert() {
        let response;
        response = fs.readFileSync(path.join(__dirname, '..', 'data', 'organizations', 'ORG_001.json'));
        this.databaseSdk.insert('bmmdg_orgsearch', 'orgSearch', response);

    }
}