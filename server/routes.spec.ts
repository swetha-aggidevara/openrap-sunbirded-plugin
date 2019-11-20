import { InitializeEnv } from './test_data/initialize_env';
import { logger } from '@project-sunbird/ext-framework-server/logger';
import * as _ from "lodash";
import * as supertest from 'supertest';
import { ConnectToServer } from './test_data/routes.test.server';
import { expect } from 'chai';
import { telemetry_v1, telemetry_v3, error_telemetry_v1, error_telemetry_v3 } from './test_data/routes.spec.data';
const initialzeEnv = new InitializeEnv();
let server = new ConnectToServer();
let app;
let importId;

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
                if (err && res.statusCode >= 400) {  return done(); };
                done();
            });
    }).timeout(20000);
})


describe('Test Resourcebundle', () => {

    it('#resourcebundle for english', (done) => {
        supertest(app)
            .get(`/resourcebundles/v1/read/en`)
            .expect('Content-Type', 'application/json; charset=utf-8')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.resoucebundles.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.result).to.have.property('consumption');
                expect(res.body.result.result.consumption.frmelmnts.lbl).to.deep.include({ creators: 'Creators' });
                done();
            });
    });

    it('#resourcebundle for telugu', (done) => {
        supertest(app)
            .get(`/resourcebundles/v1/read/te`)
            .expect('Content-Type', 'application/json; charset=utf-8')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.resoucebundles.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result).to.have.property('consumption');
                expect(res.body.result.consumption.frmelmnts.lbl).to.deep.include({ creators: 'సృష్టికర్తలు' });
                done();
            });
    });

    it('#resourcebundle for hindi (ERROR)', (done) => {
        supertest(app)
            .get(`/resourcebundles/v1/read/hi`)
            .expect('Content-Type', 'application/json; charset=utf-8')
            .expect(404)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('RESOURCE_NOT_FOUND');
                expect(res.body.id).to.equal('api.resoucebundles.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
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
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.org.search').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.response.content[0]).to.deep.include({ slug: 'sunbird' });
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
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.org.search').to.be.a('string');
                expect(res.body.ver).to.equal('v1').to.be.a('string');
                expect(res.body.result.response.content[0]).to.deep.include({ slug: 'sunbird' });
                expect(res.body.result.response).to.have.property('content');
                expect(res.body.result.response).to.have.property('count');
                done();
            });
    }).timeout(20000);

    it('#organistion (ERROR)', (done) => {
        supertest(app)
            .post('/api/org/v1/search')
            .send({})
            .expect(500)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.org.search').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                done();
            });
    });

});

describe('Test Form with and without referrer', () => {

    it('#Form', (done) => {
        supertest(app)
            .post('/api/data/v1/form/read')
            .send({ "request": { "type": "content", "action": "search", "subType": "resourcebundle", "rootOrgId": "505c7c48ac6dc1edc9b08f21db5a571d" } })
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.form.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.form).to.deep.include({ type: 'content' });
                expect(res.body.result.form).to.deep.include({ subtype: 'resourcebundle' });
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
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.form.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.form).to.deep.include({ type: 'content' });
                expect(res.body.result.form).to.deep.include({ action: 'search' });
                expect(res.body.result.form).to.deep.include({ subtype: 'resourcebundle' });
                done();
            });
    });

    it('#Form (ERROR)', (done) => {
        supertest(app)
            .post('/api/data/v1/form/read')
            .send({ "request": { "type": "content", "action": "search", "subType": "resource", "rootOrgId": "505c7c48ac6dc1edc9b08f21db5a571d" } })
            .expect(404)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('RESOURCE_NOT_FOUND');
                expect(res.body.id).to.equal('api.form.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
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
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.channel.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.channel.identifier).to.equal('505c7c48ac6dc1edc9b08f21db5a571d');
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
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.id).to.equal('api.channel.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.channel.identifier).to.equal('505c7c48ac6dc1edc9b08f21db5a571d');
                expect(res.body.result.channel.status).to.equal('Live');
                done();
            });
    });

    it('#Channel (ERROR)', (done) => {
        supertest(app)
            .get('/api/channel/v1/read/nochannel')
            .expect(404)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('RESOURCE_NOT_FOUND');
                expect(res.body.id).to.equal('api.channel.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
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
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.framework.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.framework.identifier).to.equal('TEST');
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
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.framework.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.framework.identifier).to.equal('TEST');
                done();
            });
    });

    it('#Framework (ERROR)', (done) => {
        supertest(app)
            .get('/api/framework/v1/read/noframework')
            .expect(404)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('RESOURCE_NOT_FOUND');
                expect(res.body.id).to.equal('api.framework.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
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
                if (err && res.statusCode >= 400) {  return done(); };
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
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.tenant.info').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(_.upperCase(res.body.result.titleName)).to.equal(process.env.APP_NAME);
                done();

            })
    });

});


describe('Test Telemetry', () => {

    it('#add v1 Telemetry Events', (done) => {
        supertest(app)
            .post('/content/data/v1/telemetry')
            .send(telemetry_v1)
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
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
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.telemetry').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                done();

            });
    });

    it('#add v1 Telemetry Events (ERROR)', (done) => {
        supertest(app)
            .post('/content/data/v1/telemetry')
            .send(error_telemetry_v1)
            .expect(400)
            .end((err, res) => {

                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.id).to.equal('api.telemetry').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                done();

            });
    });
    it('#add v3 Telemetry Events (ERROR)', (done) => {
        supertest(app)
            .post('/action/data/v3/telemetry')
            .send(error_telemetry_v3)
            .expect(400)
            .end((err, res) => {
                
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.id).to.equal('api.telemetry').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                done();

            });
    });
});

describe('Test Page assemble with and without referrer', () => {
    it('#Page assemble', (done) => {
        supertest(app)
            .post('/api/data/v1/page/assemble')
            .send({ "request": { "source": "web", "name": "Explore", "filters": { "channel": "505c7c48ac6dc1edc9b08f21db5a571d", "board": ["TEST_BOARD"] }, "softConstraints": { "badgeAssertions": 98, "board": 99, "channel": 100 }, "mode": "soft" } })
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.id).to.equal('api.page.assemble').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.response.id).to.be.a('string');
                expect(res.body.result.response.name).to.equal('Explore').to.be.a('string');
                done();
            });
    });

    it('#Set Referrer for Page assemble', (done) => {
        supertest(app)
            .post('/api/data/v1/page/assemble')
            .set('Referer', 'http://localhost:9010/browse')
            .send({ "request": { "source": "web", "name": "Explore", "filters": { "channel": "505c7c48ac6dc1edc9b08f21db5a571d", "board": ["TEST_BOARD"] }, "softConstraints": { "badgeAssertions": 98, "board": 99, "channel": 100 }, "mode": "soft" } })
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.page.assemble').to.be.a('string');
                expect(res.body.ver).to.equal('v1').to.be.a('string');
                expect(res.body.result.response.id).to.be.a('string');
                expect(res.body.result.response.name).to.equal('Explore').to.be.a('string');
                done();
            });
    }).timeout(20000);

    it('#Set Referrer for Page assemble  (ERROR)', (done) => {
        supertest(app)
            .post('/api/data/v1/page/assemble')
            .set('Referer', 'http://localhost:9010/browse')
            .send({})
            .expect(400)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('CLIENT_ERROR');
                expect(res.body.id).to.equal('api.page.assemble').to.be.a('string');
                expect(res.body.ver).to.equal('v1').to.be.a('string');
                done();
            });
    }).timeout(20000);

    it('#Page assemble mode (ERROR)', (done) => {
        supertest(app)
            .post('/api/data/v1/page/assemble')
            .send({ "request": { "source": "web", "name": "Explore", "filters": { "channel": "505c7c48ac6dc1edc9b08f21db5a571d", "board": ["TEST_BOARD"] }, "softConstraints": { "badgeAssertions": 98, "board": 99, "channel": 100 } } })
            .expect(404)
            .end((err, res) => {
                
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.id).to.equal('api.page.assemble').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.response.id).to.be.a('string');
                expect(res.body.result.response.name).to.equal('Explore').to.be.a('string');
                done();
            });
    });

    it('#Page assemble  Name (ERROR)', (done) => {
        supertest(app)
            .post('/api/data/v1/page/assemble')
            .send({"request": {"(source)":"web","name":"EXPLORE_PAGE"}})
            .expect(404)
            .end((err, res) => {
                
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.id).to.equal('api.page.assemble').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                done();
            });
    });

});

describe('Test Import Content/Collection', () => { 

    it('#Import Collections ', (done) => {
        let file_path = [`${__dirname}/test_data/to_import_contents/25th Sept Book.ecar`,`${__dirname}/test_data/to_import_contents/Maths_VI6.ecar`, `${__dirname}/test_data/to_import_contents/TextBookTest.ecar`, `${__dirname}/test_data/to_import_contents/TEST.ecar`];
        let req = supertest(app).post('/api/content/v1/import');
        req.send(file_path);
        req.expect(200);
        req.end((err, res) => {
            if (res.statusCode >= 500) { logger.error(err); return done(); }
            if (err && res.statusCode >= 400) {  return done(); };
            importId = res.body.result.importedJobIds;
            expect(res.body.id).to.equal('api.content.import').to.be.a('string');
            expect(res.body.ver).to.equal('1.0').to.be.a('string');
            expect(res.body.result.importedJobIds).to.be.an('array');
            expect(res.body.result).to.have.property('importedJobIds');
            done();
        });
    }).timeout(200000);
    
    it('#Import v1 collection cancel', done => {
        let req = supertest(app).post(`/api/content/v1/import/cancel/${importId[0]}`);
        req.send({});
        req.expect(200);
        req.end((err, res) => {
            
            if (res.statusCode >= 500) {
                logger.error(err);
                return done();
            }
            if (err && res.statusCode >= 400) {
                return done();
            }
            expect(res.body.id).to.equal('api.content.import').to.be.a('string');
            expect(res.body.ver).to.equal('1.0').to.be.a('string');
            expect(res.body.params.status).to.be.a('string');
            expect(res.body.params.status).to.equal('successful');
            expect(res.body.result).to.be.an('object');
            done();
        });
    }).timeout(200000);

    it('#Import v1 collection import again', done => {
        let file_path = `${__dirname}/test_data/to_import_contents/25th Sept Book.ecar`;
        let req = supertest(app).post('/api/content/v1/import');
        req.send([file_path]);
        req.expect(200);
        req.end((err, res) => {
            
            if (res.statusCode >= 500) {
                logger.error(err);
                return done();
            }
            if (err && res.statusCode >= 400) {
                return done();
            }
            importId = res.body.result.importedJobIds;
            console.log('impr id', importId, importId[0]);
            expect(res.body.id).to.equal('api.content.import').to.be.a('string');
            expect(res.body.ver).to.equal('1.0').to.be.a('string');
            expect(res.body.result.importedJobIds).to.be.an('array');
            expect(res.body.result).to.have.property('importedJobIds');
            done();
        });
    }).timeout(200000);


    it('#Import v1 collection import again', done => {
        let file_path = `${__dirname}/test_data/to_import_contents/25th Sept Book.ecar`;
        let req = supertest(app).post('/api/content/v1/import');
        req.send([file_path]);
        req.expect(200);
        req.end((err, res) => {
            if (res.statusCode >= 500) {
                logger.error(err);
                return done();
            }
            if (err && res.statusCode >= 400) {
                return done();
            }
            expect(res.body.id).to.equal('api.content.import').to.be.a('string');
            expect(res.body.ver).to.equal('1.0').to.be.a('string');
            expect(res.body.result.importedJobIds).to.be.an('array');
            expect(res.body.result).to.have.property('importedJobIds');
            done();
        });
    }).timeout(200000);

    it('#Import v1 collection pause', done => {
        let req = supertest(app).post(`/api/content/v1/import/pause/${importId[0]}`);
        req.send({});
        req.expect(200);
        req.end((err, res) => {
            if (res.statusCode >= 500) {
                logger.error(err);
                return done();
            }
            if (err && res.statusCode >= 400) {
                return done();
            }
                expect(res.body.id).to.equal('api.content.import').to.be.a('string');
            expect(res.body.ver).to.equal('1.0').to.be.a('string');
            expect(res.body.params.status).to.be.a('string');
            expect(res.body.result).to.be.an('object');

            done();
        });
    }).timeout(200000);

    it('#Import v1 collection resume', done => {
        let req = supertest(app).post(`/api/content/v1/import/resume/${importId[0]}`);
        req.send({});
        req.expect(200);
        req.end((err, res) => {
            if (res.statusCode >= 500) {
                logger.error(err);
                return done();
            }
            if (err && res.statusCode >= 400) {
                return done();
            }
            expect(res.body.id).to.equal('api.content.import').to.be.a('string');
            expect(res.body.ver).to.equal('1.0').to.be.a('string'); 
            expect(res.body.params.status).to.be.a('string');
            expect(res.body.result).to.be.an('object');
            done();
        });
    }).timeout(230000);

    it('#Import v1 collection pause (ERROR)', done => {
        let req = supertest(app).post(`/api/content/v1/import/pause/645764546776`);
        req.send({});
        req.expect(500);
        req.end((err, res) => {
            expect(res.body.id).to.equal('api.content.import').to.be.a('string');
            expect(res.body.ver).to.equal('1.0').to.be.a('string');
            expect(res.body.params.status).to.be.a('string');
            expect(res.body.params.status).to.equal('failed');
            expect(res.body.result).to.be.an('object');
            expect(res.body.params.errmsg).to.contain('Error while processing the request');
            done();
        });
    }).timeout(200000);

    it('#Import v1 collection resume (ERROR)', done => {
        let req = supertest(app).post(`/api/content/v1/import/resume/645764546776`);
        req.send({});
        req.expect(500);
        req.end((err, res) => {  
            expect(res.body.id).to.equal('api.content.import').to.be.a('string');
            expect(res.body.ver).to.equal('1.0').to.be.a('string');
            expect(res.body.params.status).to.be.a('string');
            expect(res.body.params.status).to.equal('failed');
            expect(res.body.result).to.be.an('object');
            expect(res.body.params.errmsg).to.contain('Error while processing the request');
            done();
        });
    }).timeout(200000);

    it('#Import v1 collection cancel (ERROR)', done => {
        let req = supertest(app).post(`/api/content/v1/import/cancel/645764546776`);
        req.send({});
        req.expect(500);
        req.end((err, res) => {
            expect(res.body.id).to.equal('api.content.import').to.be.a('string');
            expect(res.body.ver).to.equal('1.0').to.be.a('string');
            expect(res.body.params.status).to.be.a('string');
            expect(res.body.params.status).to.equal('failed');
            expect(res.body.result).to.be.an('object');
            expect(res.body.params.errmsg).to.contain('Error while processing the request');
            done();
        });
    }).timeout(200000);

});

describe('Test Download Content', () => {
    it('#Download Content', (done) => {
        supertest(app)
            .post('/api/content/v1/download/KP_FT_1564394134764')
            .send({})
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.content.download').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result).to.have.property('downloadId');
                done();
            });
    }).timeout(100000);

    it('#Download Collection', (done) => {
        supertest(app)
            .post('/api/content/v1/download/KP_FT_1563858046256')
            .send({})
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.content.download').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result).to.have.property('downloadId');
                done();
            });
    }).timeout(100000);

    it('#Download Content List', (done) => {
        const interval = setInterval(() => {
            supertest(app)
                .post('/api/content/v1/download/list')
                .send({})
                .expect(200)
                .end((err, res) => {
                    if (res.statusCode >= 500) { logger.error(err); return done(); }
                    if (err && res.statusCode >= 400) {  return done(); };
                        expect(res.body.result.response.contents).to.be.an('array');
                        expect(res.body.result.response.contents[0]).to.have.property('contentId');
                        expect(res.body.result.response.contents[0]).to.have.property('resourceId');
                        clearInterval(interval);
                        done();
                });
        }, 2000);
    }).timeout(210000);

    it('#Download Content (ERROR)', (done) => {
        supertest(app)
            .post('/api/content/v1/download/KP_FT_1564394134')
            .send({})
            .expect(500)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('INTERNAL_SERVER_ERROR');
                expect(res.body.id).to.equal('api.content.download').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                done();
            });
    }).timeout(100000);
});

describe('Test Content search with and without referrer', () => {

    it('#Search Content', (done) => {
        supertest(app)
            .post('/api/content/v1/search')
            .send({ "request": { "filters": { "channel": "505c7c48ac6dc1edc9b08f21db5a571d", "contentType": ["Collection", "TextBook", "LessonPlan", "Resource"] }, "limit": 20, "softConstraints": { "badgeAssertions": 98, "board": 99, "channel": 100 }, "mode": "soft", "facets": ["board", "medium", "gradeLevel", "subject", "contentType"], "offset": 0 } })
            .expect(200)
            .end((err, res) => {
                
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.id).to.equal('api.content.search').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result).to.have.property('content');
                expect(res.body.result).to.have.property('count');
                done();
            });
    });
    it('#Set Referrer for Search Content', (done) => {
        supertest(app)
            .post('/api/content/v1/search')
            .set('Referer', 'http://localhost:9010/browse')
            .send({ "request": { "filters": { "channel": "505c7c48ac6dc1edc9b08f21db5a571d", "contentType": ["Collection", "TextBook", "LessonPlan", "Resource"] }, "limit": 20, "query":"youtube", "softConstraints": { "badgeAssertions": 98, "board": 99, "channel": 100 }, "mode": "soft", "facets": ["board", "medium", "gradeLevel", "subject", "contentType"], "offset": 0 } })
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.id).to.equal('api.content.search').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result).to.have.property('content');
                expect(res.body.result).to.have.property('count');
                expect(res.body.result.content[0].mimeType).to.contain('video/x-youtube');
                done();
            });
    });

    it('#Set Referrer for Search Content (ERROR)', (done) => {
        supertest(app)
            .post('/api/content/v1/search')
            .set('Referer', 'http://localhost:9010/browse')
            .send({})
            .expect(400)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.id).to.equal('api.content.search').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                done();
            });
    });

    it('#Search Content query', (done) => {
        supertest(app)
            .post('/api/content/v1/search')
            .send({ "request": { "filters": { "channel": "505c7c48ac6dc1edc9b08f21db5a571d", "contentType": ["Collection", "TextBook", "LessonPlan", "Resource"] }, "limit": 20, "softConstraints": { "badgeAssertions": 98, "board": 99, "channel": 100 }, "mode": "soft", "facets": ["board", "medium", "gradeLevel", "subject", "contentType"], "offset": 0, "query": "kp" } })
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };  
                expect(res.body.id).to.equal('api.content.search').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result).to.have.property('content');
                expect(res.body.result).to.have.property('count');
                done();
            });
    });
    it('#Search Content wrong url', (done) => {
        supertest(app)
            .post('/api/content/v1/search')
            .send({ "request": { "filters": {} } })
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                done();
            });
    });
});

describe('Test Read Content/Collection with and without referrer', () => {
    it('#Get Content', (done) => {
        supertest(app)
            .get('/api/content/v1/read/KP_FT_1564394134764')
            .set('Content-Type', 'application/json/')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.content.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result).to.have.property('content');
                expect(res.body.result.content.identifier).to.equal('KP_FT_1564394134764').to.be.a('string');
                done();
            });
    });
    
    it('#check for Content update', (done) => {
        supertest(app)
            .get('/api/content/v1/read/do_112832394979106816112')
            .set('Content-Type', 'application/json/')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) { return done(); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.content.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result).to.have.property('content');
                expect(res.body.result.content.identifier).to.equal('do_112832394979106816112').to.be.a('string');
                done();
            });
    });
    it('#update available', (done) => {
        supertest(app)
            .get('/api/content/v1/read/do_112832394979106816112')
            .set('Content-Type', 'application/json/')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) { return done(); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.content.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result).to.have.property('content');
                expect(res.body.result.content.identifier).to.equal('do_112832394979106816112').to.be.a('string');
                done();
            });
    });

    it('#set referrer for Get Content', (done) => {
        supertest(app)
            .get('/api/content/v1/read/KP_FT_1564394134764')
            .set('Content-Type', 'application/json/')
            .set('Referer', 'http://localhost:9010/browse')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.content.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result).to.have.property('content');
                expect(res.body.result.content.identifier).to.equal('KP_FT_1564394134764').to.be.a('string');
                done();
            });
    });
    it('#Content/plugins/preview', (done) => {
        supertest(app)
            .get('/contentPlayer/preview/*')
            .set('Content-Type', 'application/javascript; charset=UTF-8')
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                done();
            });
    });
    it('#Get CourseHierarchy ', (done) => {
        supertest(app)
            .get('/api/course/v1/hierarchy/KP_FT_1563858046256')
            .set('Content-Type', 'application/json/')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('OK'); 
                expect(res.body.id).to.equal('api.content.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.content.identifier).to.equal('KP_FT_1563858046256').to.be.a('string');
                done();
            });
    });

    it('#Set referrer for Get CourseHierarchy ', (done) => {
        supertest(app)
            .get('/api/course/v1/hierarchy/KP_FT_1563858046256')
            .set('Content-Type', 'application/json/')
            .set('Referer', 'http://localhost:9010/browse')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.course.hierarchy').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.content.identifier).to.equal('KP_FT_1563858046256').to.be.a('string');
                done();
            });
    });
    it('#set referrer for Get Content (ERROR)', (done) => {
        supertest(app)
            .get('/api/content/v1/read/KP_FT_156439413')
            .set('Content-Type', 'application/json/')
            .set('Referer', 'http://localhost:9010/browse')
            .expect(404)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.id).to.equal('api.content.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                done();
            });
    });
    it('#Set referrer for Get CourseHierarchy (ERROR)', (done) => {
        supertest(app)
            .get('/api/course/v1/hierarchy/KP_FT_156385804')
            .set('Content-Type', 'application/json/')
            .set('Referer', 'http://localhost:9010/browse')
            .expect(404)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.id).to.equal('api.course.hierarchy').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                done();
            });
    });

    it('#Get Content (ERROR)', (done) => {
        supertest(app)
            .get('/api/content/v1/read/KP_FT_156439413')
            .set('Content-Type', 'application/json/')
            .expect(404)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.id).to.equal('api.content.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                done();
            });
    });
});

describe('Update content', () => {
 it('#update content', (done) => {
    supertest(app)
    .post('/api/content/v1/update/do_112832394979106816112')
    .send({})
    .expect(200)
    .end((err, res) => {
        
        if (res.statusCode >= 500) { logger.error(err); return done(); }
        if (err && res.statusCode >= 400) { return done(); };
        expect(res.body.id).to.equal('api.content.update').to.be.a('string');
        expect(res.body.params.status).to.equal('successful');
        expect(res.body.ver).to.equal('1.0').to.be.a('string');
        expect(res.body.result).to.be.a('string');
        done();
    });
 });

 it('#update collection', (done) => {
    supertest(app)
    .post('/api/content/v1/update/do_112835337547972608153')
    .send({})
    .expect(200)
    .end((err, res) => {
        
        if (res.statusCode >= 500) { logger.error(err); return done(); }
        if (err && res.statusCode >= 400) { return done(); };
        expect(res.body.id).to.equal('api.content.update').to.be.a('string');
        expect(res.body.params.status).to.equal('successful');
        expect(res.body.ver).to.equal('1.0').to.be.a('string');
        expect(res.body.result).to.be.a('string');
        done();
    });
 });

 it('#update content inside collection', (done) => {
    supertest(app)
    .post('/api/content/v1/update/do_112832394979106816112')
    .send({request: {parentId: 'do_112835337547972608153' }})
    .expect(200)
    .end((err, res) => {
        
        if (res.statusCode >= 500) { logger.error(err); return done(); }
        if (err && res.statusCode >= 400) { return done(); };
        expect(res.body.id).to.equal('api.content.update').to.be.a('string');
        expect(res.body.params.status).to.equal('successful');
        expect(res.body.ver).to.equal('1.0').to.be.a('string');
        expect(res.body.result).to.be.a('string');
        done();
    });
 });


 it('#update content (Not Updated)', (done) => {
    supertest(app)
    .post('/api/content/v1/update/do_11275905761520025614')
    .send({})
    .expect(200)
    .end((err, res) => {
        
        if (res.statusCode >= 500) { logger.error(err); return done(); }
        if (err && res.statusCode >= 400) { return done(); };
        expect(res.body.id).to.equal('api.content.update').to.be.a('string');
        expect(res.body.params.status).to.equal('failed');
        expect(res.body.ver).to.equal('1.0').to.be.a('string');
        expect(res.body.params.errmsg).to.equal('Update not available');
        done();
    });
 });

 it('#update content (ERROR)', (done) => {
    supertest(app)
    .post('/api/content/v1/update/do_112832394979106')
    .send({})
    .expect(200)
    .end((err, res) => {
        
        expect(res.body.id).to.equal('api.content.update').to.be.a('string');
        expect(res.body.params.status).to.equal('failed');
        expect(res.body.result).to.be.an('object');
        expect(res.body.responseCode).to.equal('RESOURCE_NOT_FOUND');
        done();
    });
 });

});

describe.skip('Test Export Content/Collection', () => {

    it('#Export Content', (done) => {
        supertest(app)
            .get('/api/content/v1/export/KP_FT_1564394134764')
            .set('Accept', 'application/json')
            .expect('Content-Type', 'application/json; charset=utf-8')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.content.export').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.response).to.have.property('url');
                done();
            });
    }).timeout(100000);

    it('#Export Collection', (done) => {
        supertest(app)
            .get('/api/content/v1/export/KP_FT_1563858046256')
            .set('Accept', 'application/json')
            .expect('Content-Type', 'application/json; charset=utf-8')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.content.export').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.response).to.have.property('url');
                done();
            });
    }).timeout(10000);

    it('#Export Content (ERROR)', (done) => {
        supertest(app)
            .get('/api/content/v1/export/KP_FT_156439413')
            .set('Accept', 'json')
            .expect('Content-Type', 'application/json; charset=utf-8')
            .expect(500)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };
                expect(res.body.responseCode).to.equal('INTERNAL_SERVER_ERROR');
                expect(res.body.id).to.equal('api.content.export').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                done();
            });
    });
});

describe.skip('App Update', () => {

    it('#app update', (done) => {
        process.env.APP_VERSION = '1.0.0';
        supertest(app)
            .get('/api/desktop/v1/update')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };  
                expect(res.body.params.status).to.equal('successful');
                expect(res.body.id).to.equal('api.desktop.update').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.updateAvailable).to.be.true;
                expect(res.body.result.version).not.to.be.empty;
                expect(res.body.result.url).not.to.be.empty;
                done();
            });
    });

    it('#app not update', (done) => { 
        process.env.APP_VERSION = '1.0.2';   
        supertest(app)
            .get('/api/desktop/v1/update')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) {  return done(); };  
                expect(res.body.params.status).to.equal('successful');
                expect(res.body.id).to.equal('api.desktop.update').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.updateAvailable).to.be.false;
                done();
            });
    });
});

describe('User API', () => {
    it('#User create success', (done) => {
        supertest(app)
            .post('/api/desktop/user/v1/create')
            .send({ "request": { "framework": { "board": "english", "medium": ["english"], "gradeLevel": ["class 5"] } } })
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) { return done(); };
                expect(res.body.params.status).to.equal('successful');
                expect(res.body.id).to.equal('api.desktop.user.create').to.be.a('string');
                expect(res.body.result.id).not.to.be.empty;
                done();
            });
    });

    it('#User create 409 conflict', (done) => {
        supertest(app)
            .post('/api/desktop/user/v1/create')
            .send({ "request": { "framework": { "board": "english", "medium": ["english"], "gradeLevel": ["class 5"] } } })
            .expect(409)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) { return done(); };
                expect(res.body.params.status).to.equal('failed');
                expect(res.body.params.errmsg).to.equal('User already exist with name guest');
                expect(res.body.id).to.equal('api.desktop.user.create').to.be.a('string');
                done();
            });
    });

    it('#User create 500 internal server error', (done) => {
        supertest(app)
            .post('/api/desktop/user/v1/create')
            .send()
            .expect(500)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) { return done(); };
                expect(res.body.params.status).to.equal('failed');
                expect(res.body.id).to.equal('api.desktop.user.create').to.be.a('string');
                done();
            });
    });

    it('#User read success', (done) => {
        supertest(app)
            .get('/api/desktop/user/v1/read')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.statusCode >= 400) { return done(); };
                expect(res.body.params.status).to.equal('successful');
                expect(res.body.id).to.equal('api.desktop.user.read').to.be.a('string');
                expect(res.body.result.name).to.equal('guest');
                expect(res.body.result).not.to.be.empty;
                done();
            });
    });

});

after('Disconnect Server', (done) => {
    server.close();
    done();
});