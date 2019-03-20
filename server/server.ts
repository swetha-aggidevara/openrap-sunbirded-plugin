
import { Manifest, BaseServer } from '@project-sunbird/ext-framework-server/models';
import { frameworkAPI } from '@project-sunbird/ext-framework-server/api';
import * as path from 'path';

export class Server extends BaseServer {

  constructor(manifest: Manifest) {
    super(manifest);
    frameworkAPI.registerStaticRoute(path.join(__dirname, '..', '..', 'dist'));
    frameworkAPI.setStaticViewEngine('ejs')
  }
  public test(req, res, next) {
    res.status(200)
      .send('test')
  }
}