
import { Manifest, BaseServer } from '@project-sunbird/ext-framework-server/models';
import { frameworkAPI } from '@project-sunbird/ext-framework-server/api';
import * as path from 'path';

export class Server extends BaseServer {

  private sunbirded_plugin_initialized = false;
  constructor(manifest: Manifest) {
    super(manifest);

    //insertConfig()
    //setupDirectories()
    //registerAcrossAllSDKS()


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

