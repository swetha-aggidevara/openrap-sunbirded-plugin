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
import Content from './controllers/content';


export class Router {
	init(app: any, manifest: Manifest, auth?: any) {
		const server = frameworkAPI.getPluginInstance(manifest.id);
		//portal static routes
		app.all(['/', '/explore', '/play/*'], (req, res) => {
			const locals = this.getLocals();
			_.forIn(locals, (value, key) => {
				res.locals[key] = value;
			})
			res.render(path.join(__dirname, '..', '..', 'portal', 'index.ejs'))
		})


		// api's for portal

		let resourcebundle = new ResourceBundle(manifest);
		app.get('/resourcebundles/v1/read/:id', (req, res) => { resourcebundle.get(req, res) })

		let organization = new Organization(manifest);
		app.post('/api/org/v1/search', (req, res) => { organization.search(req, res) })

		let form = new Form(manifest);
		app.post('/api/data/v1/form/read', (req, res) => { form.search(req, res) })


		let channel = new Channel(manifest);
		app.get('/api/channel/v1/read/:id', (req, res) => { channel.get(req, res) })

		let framework = new Framework(manifest);
		app.get('/api/framework/v1/read/:id', (req, res) => { framework.get(req, res) })

		let page = new Page(manifest);
		app.post('/api/data/v1/page/assemble', (req, res) => { page.get(req, res) })

		let tenant = new Tenant()
		app.get(['/v1/tenant/info/', '/v1/tenant/info/:id'], (req, res) => { tenant.get(req, res) })

		let content = new Content();
		app.get('/api/content/v1/read/:id', (req, res) => { content.get(req, res) })

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
		locals.defaultTenant = process.env.channel || 'ntp'
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