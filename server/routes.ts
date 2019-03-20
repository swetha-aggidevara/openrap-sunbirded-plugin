import { Manifest } from '@project-sunbird/ext-framework-server/models/Manifest';
import { frameworkAPI } from '@project-sunbird/ext-framework-server/api';
import * as path from 'path';
import * as _ from 'lodash';

export class Router {
	init(app: any, manifest: Manifest, auth?: any) {
		const server = frameworkAPI.getPluginInstance(manifest.id);
		//portal static routes
		app.all('/', (req, res) => {
			const locals = this.getLocals();
			_.forIn(locals, (value, key) => {
				res.locals[key] = value;
			})
			res.render(path.join(__dirname, '..', '..', 'dist', 'index.ejs'))
		})

		app.get('/get', (req, res, next) => { server.test(req, res, next) })
	}

	getLocals() {
		var locals: any = {}
		locals.userId = null
		locals.sessionId = null
		locals.cdnUrl = ''
		locals.theme = ''
		locals.defaultPortalLanguage = 'en'
		locals.instance = 'dev'
		locals.appId = 'local.sunbird.offline-app'
		locals.defaultTenant = 'ntp'
		locals.exploreButtonVisibility = 'true'
		locals.helpLinkVisibility = null
		locals.defaultTenantIndexStatus = null
		locals.extContWhitelistedDomains = null
		locals.buildNumber = '1.15.0'
		locals.apiCacheTtl = '0'
		locals.cloudStorageUrls = null
		locals.userUploadRefLink = null
		locals.deviceRegisterApi = null
		locals.googleCaptchaSiteKey = null
		locals.videoMaxSize = null
		locals.reportsLocation = null
		return locals;
	}
}