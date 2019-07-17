import { Manifest } from '@project-sunbird/ext-framework-server/models/Manifest';
import { frameworkAPI } from '@project-sunbird/ext-framework-server/api';
import * as path from 'path';
import * as _ from 'lodash';
import { ResourceBundle } from './controllers/resourceBundle';
import { Organization } from './controllers/organization';
import { Form } from './controllers/form';
import { Channel } from './controllers/channel';
import { Framework } from './controllers/framework';
import { Page } from './controllers/page';
import Tenant from './controllers/tenant';
import Content from './controllers/content/content';
import Telemetry from './controllers/telemetry';
import * as proxy from 'express-http-proxy';
import ContentDownload from './controllers/content/contentDownload';
import * as url from 'url';
import config from './config';
import { logger } from '@project-sunbird/ext-framework-server/logger';
import * as uuid from "uuid";


const proxyUrl = process.env.APP_BASE_URL;

export class Router {
  init(app: any, manifest: Manifest, auth?: any) {
    const enableProxy = req => {
      let flag = false;
      const refererUrl = new url.URL(req.get('referer'));
      let pathName = refererUrl.pathname;
      flag = _.startsWith(pathName, '/browse');
      return flag;
    };

    const updateRequestBody = req => {
      if (_.get(req, 'body.request.filters')) {
        req.body.request.filters.compatibilityLevel = {
          "<=": config.get("CONTENT_COMPATIBILITY_LEVEL")
        };
      }
      return req;
    };

    //portal static routes
    app.all(
      [
        '/',
        '/play/*',
        '/import/content',
        '/get',
        '/get/*',
        '/browse',
        '/browse/*',
        '/search/*',
        '/help-center',
        '/help-center/*'
      ],
      (req, res) => {
        const locals = this.getLocals();
        _.forIn(locals, (value, key) => {
          res.locals[key] = value;
        });
        res.render(
          path.join(__dirname, '..', '..', 'public', 'portal', 'index.ejs')
        );
      }
    );

    // api's for portal

    let resourcebundle = new ResourceBundle(manifest);
    app.get('/resourcebundles/v1/read/:id', (req, res, next) => {
      return resourcebundle.get(req, res);
    });

    let organization = new Organization(manifest);
    app.post(
      '/api/org/v1/search',
      (req, res, next) => {
        if (enableProxy(req)) {
          next();
        } else {
          return organization.search(req, res);
        }
      },
      proxy(proxyUrl, {
        proxyReqPathResolver: function(req) {
          return `/api/org/v1/search`;
        }
      })
    );

    let form = new Form(manifest);
    app.post(
      '/api/data/v1/form/read',
      (req, res, next) => {
        if (enableProxy(req)) {
          next();
        } else {
          return form.search(req, res);
        }
      },
      proxy(proxyUrl, {
        proxyReqPathResolver: function(req) {
          return `/api/data/v1/form/read`;
        }
      })
    );

    let channel = new Channel(manifest);
    app.get(
      '/api/channel/v1/read/:id',
      (req, res, next) => {
        if (enableProxy(req)) {
          next();
        } else {
          return channel.get(req, res);
        }
      },
      proxy(proxyUrl, {
        proxyReqPathResolver: function(req) {
          return `/api/channel/v1/read/${req.params.id}`;
        }
      })
    );

    let framework = new Framework(manifest);
    app.get(
      '/api/framework/v1/read/:id',
      (req, res, next) => {
        if (enableProxy(req)) {
          next();
        } else {
          return framework.get(req, res);
        }
      },
      proxy(proxyUrl, {
        proxyReqPathResolver: function(req) {
          return `/api/framework/v1/read/${req.params.id}`;
        }
      })
    );

    let page = new Page(manifest);
    app.post(
      '/api/data/v1/page/assemble',
      (req, res, next) => {
        if (enableProxy(req)) {
          req = updateRequestBody(req);
          next();
        } else {
          return page.get(req, res);
        }
      },
      proxy(proxyUrl, {
        proxyReqPathResolver: function(req) {
          return `/api/data/v1/page/assemble`;
        },
        userResDecorator: function(proxyRes, proxyResData) {
          return new Promise(function(resolve) {
            const proxyData = content.convertBufferToJson(proxyResData);
            let sections = _.get(proxyData, 'result.response.sections');
            if (!_.isEmpty(sections)) {
              content
                .decorateSections(sections)
                .then(() => {
                  resolve(proxyData);
                })
                .catch(err => {
                  logger.error('Received error err.message', err);
                  resolve(proxyData);
                });
            } else {
              resolve(proxyData);
            }
          });
        }
      })
    );

    let tenant = new Tenant();
    app.get(
      ['/v1/tenant/info/', '/v1/tenant/info/:id'],
      (req, res, next) => {
        if (enableProxy(req)) {
          next();
        } else {
          tenant.get(req, res);
          return;
        }
      },
      proxy(proxyUrl, {
        proxyReqPathResolver: function(req) {
          return `/v1/tenant/info/`;
        }
      })
    );

    let content = new Content(manifest);
    app.get(
      '/api/content/v1/read/:id',
      (req, res, next) => {
        if (enableProxy(req)) {
          next();
        } else {
          content.get(req, res);
          return;
        }
      },
      proxy(proxyUrl, {
        proxyReqPathResolver: function(req) {
          return `/api/content/v1/read/${req.params.id}?fields=${
            req.query.fields
          }`;
        },
        userResDecorator: function(proxyRes, proxyResData) {
          return new Promise(function(resolve) {
            const proxyData = content.convertBufferToJson(proxyResData);
            let contents = _.get(proxyData, 'result.content');
            if (!_.isEmpty(contents)) {
              content
                .decorateContentWithProperty([contents])
                .then(() => {
                  resolve(proxyData);
                })
                .catch(err => {
				  logger.error('Received error err.message', err);
                  resolve(proxyData);
                });
            } else {
              resolve(proxyData);
            }
          });
        }
      })
    );

    app.get(
      '/api/course/v1/hierarchy/:id',
      (req, res, next) => {
        if (enableProxy(req)) {
          next();
        } else {
          content.get(req, res);
          return;
        }
      },
      proxy(proxyUrl, {
        proxyReqPathResolver: function(req) {
          return `/api/course/v1/hierarchy/${req.params.id}`;
        },
        userResDecorator: function(proxyRes, proxyResData) {
          return new Promise(function(resolve) {
            const proxyData = content.convertBufferToJson(proxyResData);
            let contents = _.get(proxyData, 'result.content');
            if (!_.isEmpty(contents)) {
              content
                .decorateDialCodeContents(contents)
                .then(() => {
                  resolve(proxyData);
                })
                .catch(err => {
				  logger.error('Received error err.message', err);
                  resolve(proxyData);
                });
            } else {
              resolve(proxyData);
            }
          });
        }
      })
    );

    app.post(
      '/api/content/v1/search',
      (req, res, next) => {
        if (enableProxy(req)) {
          req = updateRequestBody(req);
          next();
        } else {
          content.search(req, res);
          return;
        }
      },
      proxy(proxyUrl, {
        proxyReqPathResolver: function(req) {
          return `/api/content/v1/search`;
        },
        userResDecorator: function(proxyRes, proxyResData) {
          return new Promise(function(resolve) {
            const proxyData = content.convertBufferToJson(proxyResData);
            let contents = _.get(proxyData, 'result.content');
            if (!_.isEmpty(contents)) {
              content
                .decorateContentWithProperty(contents)
                .then(() => {
                  resolve(proxyData);
                })
                .catch(err => {
                  resolve(proxyData);
                });
            } else {
              resolve(proxyData);
            }
          });
        }
      })
    );

    app.post('/api/content/v1/import', (req, res) => {
      logger.debug(`Received API call to import Content and checking for x-msgid`)
      let x_msgId =_.get(req.headers, 'x-msgid');
      if(_.isEmpty(x_msgId)) {
        x_msgId = uuid.v4();
        logger.info(` X-msgId is not found in headers so created a new X-msgid using uuid: ${x_msgId}`);
      }
      logger.info(` x-msgID:${x_msgId}`);
      logger.debug(`X-msgID = "${x_msgId}": Calling  import method for importing content`);
      content.import(req, res, x_msgId);
    });
    app.get('/api/content/v1/export/:id', (req, res) => {
      content.export(req, res);
    });

    let contentDownload = new ContentDownload(manifest);
    app.post('/api/content/v1/download/list', (req, res) => {
      contentDownload.list(req, res);
    });
    app.post('/api/content/v1/download/:id', (req, res) => {
      contentDownload.download(req, res);
    });

    let telemetry = new Telemetry(manifest);

    app.post('/content/data/v1/telemetry', (req, res) => {
      telemetry.addEvents(req, res);
    });
    app.post('/action/data/v3/telemetry', (req, res) => {
      telemetry.addEvents(req, res);
    });

    app.post('/api/v1/device/registry/:id', (req, res) => {
      telemetry.registerDevice(req, res);
    });

    app.use(
      '/content-plugins/*',
      proxy(proxyUrl, {
        proxyReqPathResolver: function(req) {
          return require('url').parse(proxyUrl + req.originalUrl).path;
        }
      })
    );

    app.use(
      '/assets/public/*',
      proxy(proxyUrl, {
        proxyReqPathResolver: function(req) {
          return require('url').parse(proxyUrl + req.originalUrl).path;
        }
      })
    );

    app.use(
      '/contentPlayer/preview/*',
      proxy(proxyUrl, {
        proxyReqPathResolver: function(req) {
          return require('url').parse(proxyUrl + req.originalUrl).path;
        }
      })
    );
  }

  getLocals() {
    var locals: any = {};
    locals.userId = null;
    locals.sessionId = null;
    locals.cdnUrl = '';
    locals.theme = '';
    locals.defaultPortalLanguage = 'en';
    locals.instance = process.env.APP_NAME;
    locals.appId = process.env.APP_ID;
    locals.defaultTenant = process.env.CHANNEL || 'sunbird';
    locals.exploreButtonVisibility = 'true';
    locals.helpLinkVisibility = null;
    locals.defaultTenantIndexStatus = null;
    locals.extContWhitelistedDomains = null;
    locals.buildNumber = '2.0.0';
    locals.apiCacheTtl = '5';
    locals.cloudStorageUrls = null;
    locals.userUploadRefLink = null;
    locals.deviceRegisterApi = null;
    locals.googleCaptchaSiteKey = null;
    locals.videoMaxSize = null;
    locals.reportsLocation = null;
    locals.deviceRegisterApi = '/api/v1/device/registry/';
    locals.playerCdnEnabled = '';
    locals.previewCdnUrl = '';
    locals.cdnWorking = null;
    locals.offlineDesktopAppTenant = '';
    locals.offlineDesktopAppVersion = '';
    locals.offlineDesktopAppReleaseDate = '';
    locals.offlineDesktopAppSupportedLanguage = '';
    locals.offlineDesktopAppDownloadUrl = '';
    return locals;
  }
}
