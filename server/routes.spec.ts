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

    it('#resourcebundle for english', (done) => {
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
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

    it('#register device (ERROR)', (done) => {
        supertest(app)
            .post('/api/v1/device/registry/3075dfa43b760f0ce8c21e52762d2040')
            .send({})
            .expect(400)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                expect(res.body.responseCode).to.equal('CLIENT_ERROR');
                expect(res.body.id).to.equal('api.device.registry').to.be.a('string');
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                expect(res.body.responseCode).to.equal('CLIENT_ERROR');
                expect(res.body.id).to.equal('api.page.assemble').to.be.a('string');
                expect(res.body.ver).to.equal('v1').to.be.a('string');
                done();
            });
    }).timeout(20000);

});

describe('Test Content search with and without referrer', () => {

    it.only('#Search Content', (done) => {
        supertest(app)
            .post('/api/content/v1/search')
            .send({ "request": { "filters": { "channel": "505c7c48ac6dc1edc9b08f21db5a571d", "contentType": ["Collection", "TextBook", "LessonPlan", "Resource"] }, "limit": 20, "softConstraints": { "badgeAssertions": 98, "board": 99, "channel": 100 }, "mode": "soft", "facets": ["board", "medium", "gradeLevel", "subject", "contentType"], "offset": 0 } })
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                expect(res.body.responseCode).to.equal('OK');
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
            .send({ "request": { "filters": { "channel": "505c7c48ac6dc1edc9b08f21db5a571d", "contentType": ["Collection", "TextBook", "LessonPlan", "Resource"] }, "limit": 20, "softConstraints": { "badgeAssertions": 98, "board": 99, "channel": 100 }, "mode": "soft", "facets": ["board", "medium", "gradeLevel", "subject", "contentType"], "offset": 0 } })
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.content.search').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result).to.have.property('content');
                expect(res.body.result).to.have.property('count');
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                expect(res.body.responseCode).to.equal('CLIENT_ERROR');
                expect(res.body.id).to.equal('api.content.search').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                done();
            });
    });

});

describe('Test Download Content', () => {
    it('#Download Content', (done) => {
        supertest(app)
            .post('/api/content/v1/download/KP_FT_1564394134764')
            .send({})
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
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
                    if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                    logger.info(`submitted: ${res.body.result.response.downloads.submitted.length}`)
                    logger.info(`inprogress: ${res.body.result.response.downloads.inprogress.length}`)
                    if (res.body.result.response.downloads.submitted.length === 0 &&
                        res.body.result.response.downloads.inprogress.length === 0) {
                        expect(res.body.responseCode).to.equal('OK');
                        expect(res.body.id).to.equal('api.content.download.list').to.be.a('string');
                        expect(res.body.ver).to.equal('1.0').to.be.a('string');
                        expect(res.body.result.response).to.have.property('downloads');
                        expect(res.body.result.response.downloads).to.have.property('submitted');
                        expect(res.body.result.response.downloads).to.have.property('inprogress');
                        expect(res.body.result.response.downloads).to.have.property('failed');
                        expect(res.body.result.response.downloads).to.have.property('completed');
                        expect(res.body.result.response.downloads.submitted).to.have.lengthOf(0);
                        expect(res.body.result.response.downloads.inprogress).to.have.lengthOf(0);
                        clearInterval(interval);
                        done();
                    };
                });
        }, 2000);
    }).timeout(200000)
});

describe('Test Read Content/Collection with and without referrer', () => {
    it('#Get Content', (done) => {
        supertest(app)
            .get('/api/content/v1/read/KP_FT_1564394134764')
            .set('Content-Type', 'application/json/')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.content.read').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result).to.have.property('content');
                expect(res.body.result.content.identifier).to.equal('KP_FT_1564394134764').to.be.a('string');
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.course.hierarchy').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.content.identifier).to.equal('KP_FT_1563858046256').to.be.a('string');
                done();
            });
    });
});

describe('Test Import Content/Collection', () => {
    it('#Import Content', (done) => {
        let file_path = `${__dirname}/test_data/to_import_contents/The Squirrel.ecar`, boundary = Math.random();
        let req = supertest(app).post('/api/content/v1/import')
        req.set('Content-Type', 'multipart/form-data; boundary=' + boundary)
        req.attach('file', file_path)
        req.expect(200)
        req.end((err, res) => {
            if (res.statusCode >= 500) { logger.error(err); return done(); }
            if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
            expect(res.body.success).to.be.true;
            expect(res.body.content.name).to.be.a('string');
            expect(res.body.content.name).to.be.a('string').to.equal('The Squirrel');
            expect(res.body.content.pkgVersion).to.be.a('number');
            expect(res.body.content.identifier).to.be.a('string');
            done();
        });
    }).timeout(100000);

    it('#Import Collection', (done) => {
        let file_path = `${__dirname}/test_data/to_import_contents/TextBookTest.ecar`, boundary = Math.random();
        let req = supertest(app).post('/api/content/v1/import')
        req.set('Content-Type', 'multipart/form-data; boundary=' + boundary)
        req.attach('file', file_path)
        req.expect(200)
        req.end((err, res) => {
            if (res.statusCode >= 500) { logger.error(err); return done(); }
            if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
            expect(res.body.success).to.be.true;
            expect(res.body.content.name).to.be.a('string');
            expect(res.body.content.name).to.be.a('string').to.equal('TextBookTest');
            expect(res.body.content.pkgVersion).to.be.a('number');
            expect(res.body.content.identifier).to.be.a('string');
            done();
        });
    }).timeout(20000);

});

describe('Test Export Content/Collection', () => {
    it('#Export Content', (done) => {
        supertest(app)
            .get('/api/content/v1/export/KP_FT_1564394134764')
            .set('Accept', 'application/json')
            .expect('Content-Type', 'application/json; charset=utf-8')
            .expect(200)
            .end((err, res) => {
                if (res.statusCode >= 500) { logger.error(err); return done(); }
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
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
                if (err && res.stausCode >= 400) { expect.fail(); return done(err); };
                expect(res.body.responseCode).to.equal('OK');
                expect(res.body.id).to.equal('api.content.export').to.be.a('string');
                expect(res.body.ver).to.equal('1.0').to.be.a('string');
                expect(res.body.result.response).to.have.property('url');
                done();

            });
    }).timeout(100000);
});

after('Disconnect Server', (done) => {
    server.close();
    done();
});