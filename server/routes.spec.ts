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
                expect(res.body.result.id).to.equal('api.resoucebundles.read').and.string;
                expect(res.body.result.ver).to.equal('1.0').and.string;
                expect(res.body.result.result).to.have.property('consumption');
                done();
            });
    });

    it('Organisation', (done) => {
        supertest(app)
            .post('/api/org/v1/search')
            .send({ "request": { "filters": { "slug": "sunbird", "isRootOrg": true } } })
            .expect(200)
            .end((err, res) => {
                if (err) throw err;
                expect(res.body.id).to.equal('api.org.search').and.string;
                expect(res.body.ver).to.equal('1.0').and.string;
                expect(res.body.result.response).to.have.property('content');
                expect(res.body.result.response).to.have.property('count');
                done();
            });
    });

    it('Set referrer for Organisation', (done) => {
        supertest(app)
            .post('/api/org/v1/search')
            .set('Referer', 'http://localhost:9010/browse')
            .send({ "request": { "filters": { "slug": "sunbird", "isRootOrg": true } } })
            .expect(200)
            .end((err, res) => {
                if (err) throw err;
                expect(res.body.id).to.equal('api.org.search').and.string;
                expect(res.body.ver).to.equal('v1').and.string;
                expect(res.body.result.response).to.have.property('content');
                expect(res.body.result.response).to.have.property('count');
                done();
            });
    });

    it('Form', (done) => {
        supertest(app)
            .post('/api/data/v1/form/read')
            .send({ "request": { "type": "content", "action": "search", "subType": "resourcebundle", "rootOrgId": "505c7c48ac6dc1edc9b08f21db5a571d" } })
            .expect(200)
            .end((err, res) => {
                if (err) throw err;
                expect(res.body.id).to.equal('api.form.read').and.string;
                expect(res.body.ver).to.equal('1.0').and.string;
                expect(res.body.result.form).to.deep.include({type: 'content'});
                expect(res.body.result.form).to.deep.include({action: 'search'});
                done();
            });
    });

    it('Set referrer for Form', (done) => {
        supertest(app)
            .post('/api/data/v1/form/read')
            .set('Referer', 'http://localhost:9010/browse')
            .send({ "request": { "type": "content", "action": "search", "subType": "resourcebundle", "rootOrgId": "505c7c48ac6dc1edc9b08f21db5a571d" } })
            .expect(200)
            .end((err, res) => {
                if (err) throw err;
                expect(res.body.id).to.equal('api.form.read').and.string;
                expect(res.body.ver).to.equal('1.0').and.string;
                expect(res.body.result.form).to.deep.include({type: 'content'});
                expect(res.body.result.form).to.deep.include({action: 'search'});
                done();
            });
    });

    it('Channel', (done) => {
        supertest(app)
            .get('/api/channel/v1/read/505c7c48ac6dc1edc9b08f21db5a571d')
            .expect(200)
            .end((err, res) => {
                if (err) throw err;
                expect(res.body.id).to.equal('api.channel.read').and.string;
                expect(res.body.ver).to.equal('1.0').and.string;
                expect(res.body.result.channel.identifier).to.equal('505c7c48ac6dc1edc9b08f21db5a571d');
                expect(res.body.result.channel.identifier).to.equal(res.body.result.channel.code);
                expect(res.body.result.channel.status).to.be.equal('Live');
                done();
            });
    });

    it('Set Referrer for Channel', (done) => {
        supertest(app)
            .get('/api/channel/v1/read/505c7c48ac6dc1edc9b08f21db5a571d')
            .set('Referer', 'http://localhost:9010/browse')
            .expect(200)
            .end((err, res) => {
                if (err) throw err;
                expect(res.body.id).to.equal('api.channel.read').and.string;
                expect(res.body.ver).to.equal('1.0').and.string;
                expect(res.body.result.channel.identifier).to.equal('505c7c48ac6dc1edc9b08f21db5a571d');
                expect(res.body.result.channel.identifier).to.equal(res.body.result.channel.code);
                expect(res.body.result.channel.status).to.be.equal('Live');
                done();
            });
    });

    it('Framework', (done) => {
        supertest(app)
            .get('/api/framework/v1/read/TEST')
            .expect(200)
            .end((err, res) => {
                if (err) throw err;
                expect(res.body.id).to.equal('api.framework.read').and.string;
                expect(res.body.ver).to.equal('1.0').and.string;
                expect(res.body.result.framework.identifier).to.equal('TEST');
                expect(res.body.result.framework.identifier).to.equal(res.body.result.framework.code);                done();
            });
    });

    it('Set Referrer for Framework', (done) => {

        supertest(app)
            .get('/api/framework/v1/read/TEST')
            .set('Referer', 'http://localhost:9010/browse')
            .expect(200)
            .end((err, res) => {
                if (err) throw err;
                expect(res.body.id).to.equal('api.framework.read').and.string;
                expect(res.body.ver).to.equal('1.0').and.string;
                expect(res.body.result.framework.identifier).to.equal('TEST');
                done();
            });
    });

    it('tenant', (done) => {
        supertest(app)
            .get('/v1/tenant/info/')
            .expect(200)
            .end((err, res) => {
                if (err) throw err;
                expect(res.body.id).to.equal('api.tenant.info').and.string;
                expect(res.body.ver).to.equal('1.0').and.string;
                expect(res.body.result.appLogo).to.equal('/appLogo.png');
                expect(res.body.result).to.have.property('logo');
                done();
            })
    });

    it('Set Referrer for tenant', (done) => {
        supertest(app)
            .get('/v1/tenant/info/')
            .set('Referer', 'http://localhost:9010/browse')
            .expect(200)
            .end((err, res) => {
                if (err) throw err;
                expect(res.body.id).to.equal('api.tenant.info').and.string;
                expect(res.body.ver).to.equal('1.0').and.string;
                expect(_.upperCase(res.body.result.titleName)).to.equal(process.env.APP_NAME);
                done();
            })
    });

    it('tenant with ID', (done) => {
        supertest(app)
            .get('/v1/tenant/info/sunbird')
            .expect(200)
            .end((err, res) => {
                if (err) throw err;
                expect(res.body.id).to.equal('api.tenant.info').and.string;
                expect(res.body.ver).to.equal('1.0').and.string;
                expect(_.upperCase(res.body.result.titleName)).to.equal(process.env.APP_NAME);
                done();
            })
    });

    it('Set referrer for tenant with ID', (done) => {
        supertest(app)
            .get('/v1/tenant/info/sunbird')
            .set('Referer', 'http://localhost:9010/browse')
            .expect(200)
            .end((err, res) => {
                if (err) throw err;
                expect(res.body.id).to.equal('api.tenant.info').and.string;
                expect(res.body.ver).to.equal('1.0').and.string;
                expect(_.upperCase(res.body.result.titleName)).to.equal(process.env.APP_NAME);
                done();
            })
    });

    after('Disconnect Server', (done) => {
        server.close();
        done();
    })

});
