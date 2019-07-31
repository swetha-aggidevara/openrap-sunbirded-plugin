import { InitializeEnv } from './test_data/initialize_env';
import { logger } from '@project-sunbird/ext-framework-server/logger';
import * as _ from "lodash";
import * as supertest from 'supertest';
import { ConnectToServer } from './test_data/routes.test.server';
import { expect } from 'chai';
import { telemetry_v1, telemetry_v3, registerDevice } from './test_data/routes.spec.data';


const initialzeEnv = new InitializeEnv();
let server = new ConnectToServer();
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



describe('All', () => {

    it('All', (done) => {
        supertest(app)
            .get('/')
            .set('Content-Type', 'text/html; charset=utf-8')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                done();
            });
    }).timeout(20000);
})


describe('Test Resourcebundle', () => {

    it('#resourcebundle', (done) => {
        supertest(app)
            .get(`/resourcebundles/v1/read/en`)
            .expect('Content-Type', 'application/json; charset=utf-8')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.resoucebundles.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.result).to.have.property('consumption');
                done();
            });
    });

});


describe('Test Organisation with and without referrer', () => {

    it('#organisation', (done) => {
        supertest(app)
            .post('/api/org/v1/search')
            .send({ "request": { "filters": { "slug": "sunbird", "isRootOrg": true } } })
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.org.search').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.response.content[0]).to.deep.include({slug: 'sunbird'});
                expect(res.body.result.response).to.have.property('content');
                expect(res.body.result.response).to.have.property('count');
                done();
            });
    });

    it('#Set referrer for Organisation', (done) => {
        supertest(app)
            .post('/api/org/v1/search')
            .set('Referer', 'http://localhost:9010/browse')
            .send({ "request": { "filters": { "slug": "sunbird", "isRootOrg": true } } })
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.org.search').to.be.a('string');
                expect(res.body.ver).to.equal('v1').to.be.a('string');
                expect(res.body.result.response.content[0]).to.deep.include({slug:'sunbird'});
                expect(res.body.result.response).to.have.property('content');
                expect(res.body.result.response).to.have.property('count');
                done();
            });
    }).timeout(20000)

});


describe('Test Form with and without referrer', () => {

    it('#Form', (done) => {
        supertest(app)
            .post('/api/data/v1/form/read')
            .send({ "request": { "type": "content", "action": "search", "subType": "resourcebundle", "rootOrgId": "505c7c48ac6dc1edc9b08f21db5a571d" } })
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.form.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.form).to.deep.include({ type: 'content' });
                expect(res.body.result.form).to.deep.include({ action: 'search' });
                done();
            });
    });

    it('#Set referrer for Form', (done) => {
        supertest(app)
            .post('/api/data/v1/form/read')
            .set('Referer', 'http://localhost:9010/browse')
            .send({ "request": { "type": "content", "action": "search", "subType": "resourcebundle", "rootOrgId": "505c7c48ac6dc1edc9b08f21db5a571d" } })
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.form.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.form).to.deep.include({ type: 'content' });
                expect(res.body.result.form).to.deep.include({ action: 'search' });
                done();
            });
    });
});


describe('Test Channel with and without referrer', () => {
    it('#Channel', (done) => {
        supertest(app)
            .get('/api/channel/v1/read/505c7c48ac6dc1edc9b08f21db5a571d')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.channel.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.channel.identifier).to.equal('505c7c48ac6dc1edc9b08f21db5a571d');
                expect(res.body.result.channel.identifier).to.equal(res.body.result.channel.code);
                expect(res.body.result.channel.status).to.equal('Live');
                done();

            });
    });

    it('#Set Referrer for Channel', (done) => {
        supertest(app)
            .get('/api/channel/v1/read/505c7c48ac6dc1edc9b08f21db5a571d')
            .set('Referer', 'http://localhost:9010/browse')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.channel.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.channel.identifier).to.equal('505c7c48ac6dc1edc9b08f21db5a571d');
                expect(res.body.result.channel.identifier).to.equal(res.body.result.channel.code);
                expect(res.body.result.channel.status).to.equal('Live');
                done();
            });
    });
});


describe('Test Framework with and without referrer', () => {

    it('#Framework', (done) => {
        supertest(app)
            .get('/api/framework/v1/read/TEST')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.framework.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.framework.identifier).to.equal('TEST');
                expect(res.body.result.framework.identifier).to.equal(res.body.result.framework.code);
                done();
            });
    });

    it('#Set Referrer for Framework', (done) => {
        supertest(app)
            .get('/api/framework/v1/read/TEST')
            .set('Referer', 'http://localhost:9010/browse')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.framework.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.framework.identifier).to.equal('TEST');
                done();
            });
    });
});


describe('Test Tenant with and without referrer', () => {

    it('#tenant', (done) => {
        supertest(app)
            .get('/v1/tenant/info/')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.tenant.info').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.appLogo).to.equal('/appLogo.png');
                expect(res.body.result).to.have.property('logo');
                done();

            })
    });

    it('#Set Referrer for tenant', (done) => {
        supertest(app)
            .get('/v1/tenant/info/')
            .set('Referer', 'http://localhost:9010/browse')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.tenant.info').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(_.upperCase(res.body.result.titleName)).to.equal(process.env.APP_NAME);
                done();

            })
    });

});


describe('Test Telemetry', () => {

    it('#Register Device', (done) => {
        supertest(app)
            .post('/api/v1/device/registry/3075dfa43b760f0ce8c21e52762d2040')
            .send(registerDevice)
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.device.registry').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                done();

            });
    });

    it('#add v1 Telemetry Events', (done) => {
        supertest(app)
            .post('/content/data/v1/telemetry')
            .send(telemetry_v1)
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                expect(res.body.responseCode).to.equal('OK');

                expect(res.body.id).to.equal('api.telemetry').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                done();

            });
    });

    it('#add v3 Telemetry Events', (done) => {
        supertest(app)
            .post('/action/data/v3/telemetry')
            .send(telemetry_v3)
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                expect(res.body.responseCode).to.equal('OK');

                expect(res.body.id).to.equal('api.telemetry').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                done();

            });
    });
});




after('Disconnect Server', (done) => {
    server.close();
    done();
})