import { InitializeEnv } from './test_data/initialize_env';

import { logger } from '@project-sunbird/ext-framework-server/logger';
import * as express from 'express';
import * as bodyParser from 'body-parser';
import * as _ from "lodash";
import * as supertest from 'supertest';
import { ConnectToServer } from './test_data/routes.test.server';
import { expect } from 'chai';


const initialzeEnv = new InitializeEnv();
let server = new ConnectToServer();

describe('Routes', () => {
    let app;
    initialzeEnv.init();
    before('StartServer', async () => {
        await server.startServer().then(res => {
            console.log('appppp', res);
            app = res;
            logger.info(`Server Connected`);

        }).catch(err => {
            logger.error(`Received Error while connecting to server err: ${err}`);

        });
    });

    it('resourcebundles', (done) => {
        supertest(app)
            .get(`/resourcebundles/v1/read/en`)
            .expect('Content-Type', 'application/json; charset=utf-8')
            .expect(200)
            .end((err, res) => {
                if (err) throw err;
                console.log(res.body);
                expect(res.body.result.id).to.equal('api.resoucebundles.read').and.string;
                expect(res.body.result.ver).to.equal('1.0').and.string;
                expect(res.body.result.result).to.have.property('consumption');
                expect(res.body.result.result).to.have.property('creation');
                done();
            });
    });

    after('Disconnect Server', (done) => {
        server.close();
        done();
    })

});
