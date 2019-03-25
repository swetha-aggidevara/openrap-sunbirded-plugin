import DatabaseSDK from '../sdk/database/index';
import { Manifest, BaseServer } from '@project-sunbird/ext-framework-server/models';

import { Inject } from 'typescript-ioc';
import * as fs from 'fs';
import * as path from 'path';
export class Framework {
    @Inject
    private databaseSdk: DatabaseSDK;
    constructor(manifest: Manifest) {
    this.databaseSdk.initialize(manifest.id);

    }
    public insert() {
        let response;
        response = fs.readFileSync(path.join(__dirname, '..', 'data', 'frameworks', 'NCFCOPY.json'));
        this.databaseSdk.insert('framework', 'NCFCOPY', response);

    }
}