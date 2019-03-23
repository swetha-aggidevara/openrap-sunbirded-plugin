
import { Manifest, BaseServer } from '@project-sunbird/ext-framework-server/models';
import { frameworkAPI } from '@project-sunbird/ext-framework-server/api';
import * as path from 'path';
import { Inject } from 'typescript-ioc';
import ContentManager from './manager/ContentManager'

export class Server extends BaseServer {

  private sunbirded_plugin_initialized = false;


  @Inject
  private contentManager: ContentManager;

  constructor(manifest: Manifest) {
    super(manifest);

    //insertConfig()
    //setupDirectories()


    //registerAcrossAllSDKS()


    this.contentManager.initialize(manifest.id)

    frameworkAPI.registerStaticRoute(path.join(__dirname, 'content_files'));
    frameworkAPI.registerStaticRoute(path.join(__dirname, '..', '..', 'dist'), '/dist');
    frameworkAPI.setStaticViewEngine('ejs')


    //- reIndex()
    //- reConfigure()
  }
  public test(req, res, next) {
    res.status(200)
      .send('test')
  }
}

