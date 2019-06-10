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

const proxyUrl = process.env.APP_BASE_URL;

export class Router {
	init(app: any, manifest: Manifest, auth?: any) {
		const server = frameworkAPI.getPluginInstance(manifest.id);

		const enableProxy = (req) => {
			let flag = false;
			const refererUrl = new url.URL(req.get('referer'));
			let pathName = refererUrl.pathname;
			flag = _.startsWith(pathName, "/browse")
			return flag;
		}

		const updateRequestBody = (req) => {
			if (_.get(req, 'body.request.filters')) {
				req.body.request.filters.compatibilityLevel = { "<=": config.get("CONTENT_COMPATIBILITY_LEVEL") }
			}
			return req;
		}

		//portal static routes
		app.all(['/', '/play/*', '/import/content', '/get', '/get/*', '/browse', '/browse/*', '/search/*'], (req, res) => {
			const locals = this.getLocals();
			_.forIn(locals, (value, key) => {
				res.locals[key] = value;
			})
			res.render(path.join(__dirname, '..', '..', 'public', 'portal', 'index.ejs'))
		})



		// api's for portal

		let resourcebundle = new ResourceBundle(manifest);
		app.get('/resourcebundles/v1/read/:id', (req, res, next) => {
			return resourcebundle.get(req, res);
		})

		let organization = new Organization(manifest);
		app.post('/api/org/v1/search', (req, res, next) => {
			if (enableProxy(req)) {
				next()
			} else {
				return organization.search(req, res)
			}
		}, proxy(proxyUrl, {
			proxyReqPathResolver: function (req) {
				return `/api/org/v1/search`;
			}
		}))

		let form = new Form(manifest);
		app.post('/api/data/v1/form/read', (req, res, next) => {
			if (enableProxy(req)) {
				next()
			} else {
				return form.search(req, res)

			}
		}, proxy(proxyUrl, {
			proxyReqPathResolver: function (req) {
				return `/api/data/v1/form/read`;
			}
		}))

		let channel = new Channel(manifest);
		app.get('/api/channel/v1/read/:id', (req, res, next) => {
			if (enableProxy(req)) {
				next()
			} else {
				return channel.get(req, res)
			}
		}, proxy(proxyUrl, {
			proxyReqPathResolver: function (req) {
				return `/api/channel/v1/read/${req.params.id}`;
			}
		}))

		let framework = new Framework(manifest);
		app.get('/api/framework/v1/read/:id', (req, res, next) => {
			if (enableProxy(req)) {
				next()
			} else {
				return framework.get(req, res)
			}
		}, proxy(proxyUrl, {
			proxyReqPathResolver: function (req) {
				return `/api/framework/v1/read/${req.params.id}`;
			}
		}))

		let page = new Page(manifest);
		app.post('/api/data/v1/page/assemble', (req, res, next) => {
			if (enableProxy(req)) {
				req = updateRequestBody(req);
				next()
			} else {
				return page.get(req, res)

			}
		}, proxy(proxyUrl, {
			proxyReqPathResolver: function (req) {
				return `/api/data/v1/page/assemble`;
			}
		}))

		let tenant = new Tenant()
		app.get(['/v1/tenant/info/', '/v1/tenant/info/:id'], (req, res, next) => {
			if (enableProxy(req)) {
				next()
			} else {
				tenant.get(req, res)
				return
			}
		}, proxy(proxyUrl, {
			proxyReqPathResolver: function (req) {
				return `/v1/tenant/info/`;
			}
		}))

		let content = new Content(manifest);
		app.get('/api/content/v1/read/:id', (req, res, next) => {
			if (enableProxy(req)) {
				next()
			} else {
				content.get(req, res)
				return
			}
		}, proxy(proxyUrl, {
			proxyReqPathResolver: function (req) {
				return `/api/content/v1/read/${req.params.id}`;
			}
		}))

		app.get('/api/course/v1/hierarchy/:id', (req, res, next) => {
			if (enableProxy(req)) {
				next()
			} else {
				content.get(req, res)
				return
			}
		}, proxy(proxyUrl, {
			proxyReqPathResolver: function (req) {
				return `/api/course/v1/hierarchy/${req.params.id}`;
			}
		}))

		app.post('/api/content/v1/search', (req, res, next) => {
			if (enableProxy(req)) {
				req = updateRequestBody(req);
				next()
			} else {
				content.search(req, res)
				return
			}
		}, proxy(proxyUrl, {
			proxyReqPathResolver: function (req) {
				return `/api/content/v1/search`;
			}
		}));

		app.post('/api/content/v1/import', (req, res) => { content.import(req, res) })
		app.get('/api/content/v1/export/:id', (req, res) => { content.export(req, res) })

		let contentDownload = new ContentDownload(manifest);
		app.post('/api/content/v1/download/list', (req, res) => { contentDownload.list(req, res) })
		app.post('/api/content/v1/download/:id', (req, res) => { contentDownload.download(req, res) })


		let telemetry = new Telemetry(manifest);

		app.post('/content/data/v1/telemetry', (req, res) => { telemetry.addEvents(req, res) })
		app.post('/action/data/v3/telemetry', (req, res) => { telemetry.addEvents(req, res) })

		app.post('/api/v1/device/registry/:id', (req, res) => { telemetry.registerDevice(req, res) })
	}

	getLocals() {
		var locals: any = {}
		locals.userId = null
		locals.sessionId = null
		locals.cdnUrl = ''
		locals.theme = ''
		locals.defaultPortalLanguage = 'en'
		locals.instance = process.env.APP_NAME
		locals.appId = process.env.APP_ID
		locals.defaultTenant = process.env.CHANNEL || 'sunbird'
		locals.exploreButtonVisibility = 'true'
		locals.helpLinkVisibility = null
		locals.defaultTenantIndexStatus = null
		locals.extContWhitelistedDomains = null
		locals.buildNumber = '2.0.0'
		locals.apiCacheTtl = '5'
		locals.cloudStorageUrls = null
		locals.userUploadRefLink = null
		locals.deviceRegisterApi = null
		locals.googleCaptchaSiteKey = null
		locals.videoMaxSize = null
		locals.reportsLocation = null
		locals.deviceRegisterApi = '/api/v1/device/registry/'
		locals.playerCdnEnabled = ''
		locals.previewCdnUrl = ""
		return locals;
	}
}