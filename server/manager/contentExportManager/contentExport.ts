import * as fs from 'fs';
import * as archiver from 'archiver';
import * as path from 'path';
import * as  _ from 'lodash';
import * as fse from 'fs-extra';
import { manifest } from '../../manifest';
import { containerAPI } from 'OpenRAP/dist/api';
let fileSDK = containerAPI.getFileSDKInstance(manifest.id);

export class ExportContent {
  tempBaseFolder = fileSDK.getAbsPath('temp');
  contentBaseFolder = fileSDK.getAbsPath('content');
  parentArchive;
  parentManifest;
  ecarName;
  interval;
  corruptContents = [];
  startTime = Date.now();
  cb;
  constructor(public parentDetails, childNodes){
    this.parentArchive = archiver('zip', { zlib: { level: 9 }});
  }
  join(...paths){
    return path.join(...paths);
  }
  public async export(cb){
    await fileSDK.mkdir('temp');
    this.cb = cb;
    try {
      this.parentManifest = await fse.readJson(this.join(this.contentBaseFolder, this.parentDetails.identifier,  'manifest.json'));
      this.ecarName =  this.parentDetails.name;
      console.log('--------exporting content of mimeType--------', this.parentDetails.mimeType);
      if (this.parentDetails.mimeType === 'application/vnd.ekstep.content-collection') {
        await this.loadParentCollection();
      } else {
        await this.loadContent(this.parentDetails, false);
      }
      this.interval = setInterval(() => console.log(this.parentArchive.pointer(), this.parentArchive._entriesCount, this.parentArchive._entriesProcessedCount), 1000);
      const data = await this.streamZip();
      this.cb(null, data);
    } catch(error) {
      this.cb(error, null);
      console.log('Got Error while exporting content', this.ecarName, error);
    }
  }
  archiveAppend(type, src, dest){
    console.log(`Adding ${src} of type ${type} to dest folder ${dest}`);
    if(type === 'path'){
      this.parentArchive.append(fs.createReadStream(src), { name: dest });
    } else if (type === 'directory'){
      this.parentArchive.directory(src, dest);
    } else if (type === 'stream'){
      this.parentArchive.append(src, { name: dest });
    } else if (type === 'createDir'){
      dest = dest.endsWith('/') ? dest : dest + '/';
      this.parentArchive.append(null, { name: dest});
    }
  }
  async validContent(contentDetails){
    if(contentDetails.appIcon){
      const appIconFileName = path.basename(contentDetails.appIcon);
      const appIcon = this.join(this.contentBaseFolder, contentDetails.identifier, appIconFileName);
      const exist = await fse.pathExists(appIcon);
      if(!exist){
        return { valid: false, reason: 'APP_ICON_MISSING'};
      }
    }
    if(contentDetails.artifactUrl && path.extname(contentDetails.artifactUrl) && path.extname(contentDetails.artifactUrl) !== '.zip'){
      const artifactUrlName = path.basename(contentDetails.artifactUrl);
      const artifactUrlPath = this.join(this.contentBaseFolder, contentDetails.identifier, artifactUrlName);
      const exist = await fse.pathExists(artifactUrlPath);
      if(!exist){
        return { valid: false, reason: 'ARTIFACT_URL_MISSING'};
      }
    }
    return { valid: true };
  }
  async loadContent(contentDetails, child){
    const contentState = await this.validContent(contentDetails);
    if(!contentState.valid){
      this.corruptContents.push({ id: contentDetails.identifier, reason: contentState.reason});
      return ;
    }
    const baseDestPath = child ? contentDetails.identifier + '/' : '';
    if(child){
      this.archiveAppend('createDir', null, contentDetails.identifier);
    }
    this.archiveAppend('path', this.join(this.contentBaseFolder, contentDetails.identifier, 'manifest.json'), baseDestPath + 'manifest.json');
    if(contentDetails.appIcon){
      if(path.dirname(contentDetails.appIcon) !== '.'){
        this.archiveAppend('createDir', null, baseDestPath +  path.dirname(contentDetails.appIcon));
      }
      const appIconFileName = path.basename(contentDetails.appIcon);
      const appIcon = this.join(this.contentBaseFolder, contentDetails.identifier, appIconFileName);
      this.archiveAppend('path', appIcon, baseDestPath + contentDetails.appIcon);
    }
    // if(contentDetails.artifactUrl && path.dirname(contentDetails.artifactUrl) !== '.'){ // not needed as appIcon and artifact url will be in same folder
    //   console.log('-------dir name created----------', baseDestPath +  path.dirname(contentDetails.artifactUrl));
    //   this.archiveAppend('createDir', null, baseDestPath +  path.dirname(contentDetails.artifactUrl));
    //   this.parentArchive.append(null, { name: baseDestPath +  path.dirname(contentDetails.artifactUrl) + '/'});
    // }
    if(contentDetails.artifactUrl && path.extname(contentDetails.artifactUrl) && path.extname(contentDetails.artifactUrl) !== '.zip'){
      const artifactUrlName = path.basename(contentDetails.artifactUrl);
      const artifactUrlPath = this.join(this.contentBaseFolder, contentDetails.identifier, artifactUrlName);
      this.archiveAppend('path', artifactUrlPath, baseDestPath + contentDetails.artifactUrl);
    } else if(contentDetails.artifactUrl && path.extname(contentDetails.artifactUrl) && path.extname(contentDetails.artifactUrl) === '.zip'){
      await this.loadZipContent(contentDetails, true);
    }
  }
  async loadZipContent(contentDetails, child){
    const baseDestPath = child ? contentDetails.identifier + '/' : '';
    const childArchive = archiver('zip', { zlib: { level: 9 }});
    const toBeZipped: any = await this.readDirectory(this.join(this.contentBaseFolder, contentDetails.identifier));
    for(const items of toBeZipped){
      console.log('--------------loadZipContent------------', items)
      if(!contentDetails.appIcon.includes(items) && items !== 'manifest.json'){
        if(path.extname(items)){
          childArchive.append(fs.createReadStream(this.join(this.contentBaseFolder, contentDetails.identifier, items)), { name: items });
        } else {
          childArchive.directory(this.join(this.contentBaseFolder, contentDetails.identifier, items), items);
        }
      }
    }
    childArchive.finalize();
    this.archiveAppend('stream', childArchive, baseDestPath + contentDetails.artifactUrl);
  }
  async loadParentCollection(){
    if(this.parentDetails.appIcon){
      const appIconFileName = path.basename(this.parentDetails.appIcon);
      const appIcon = this.join(this.contentBaseFolder, this.parentDetails.identifier, appIconFileName);
      this.archiveAppend('path', appIcon, this.parentDetails.appIcon);
      if(path.dirname(this.parentDetails.appIcon) !== '.'){
        console.log('-------dir name created----------', path.dirname(this.parentDetails.appIcon));
        this.archiveAppend('createDir', null, path.dirname(this.parentDetails.appIcon));
      }
    }
    const collectionItems: any = await this.readDirectory(this.join(this.contentBaseFolder, this.parentDetails.identifier));
    for(const items of collectionItems){
      if(!this.parentDetails.appIcon.includes(items)){
        if(path.extname(items)){
          this.archiveAppend('path', this.join(this.contentBaseFolder, this.parentDetails.identifier, items), items);
        } else {
          this.archiveAppend('directory', this.join(this.contentBaseFolder, this.parentDetails.identifier, items), items);
        }
      }
    }
    await this.loadChildNodes();
  }
  async loadChildNodes(){
    console.log('------------loading child node---------------');
    if(!this.parentDetails.childNodes || !this.parentDetails.childNodes.length){
      console.log('------------no child nodes returning---------------');
      return ;
    }
    let childNodes = _.filter(_.get(this.parentManifest, 'archive.items'),
        item => (item.mimeType !== 'application/vnd.ekstep.content-collection'))
        .map(item => item.identifier)
    for(const child of childNodes){
      const childManifest = await fse.readJson(this.join(this.contentBaseFolder, child,  'manifest.json'))
      .catch(err => {
        console.log('got error while reading content', child);
        this.corruptContents.push({ id: child, reason: 'MANIFEST_MISSING'});
      });
      if(childManifest){
        const childDetails = _.get(childManifest, 'archive.items[0]');
        await this.loadContent(childDetails, true);
      }
    }
  }
  async streamZip(){
    return new Promise((resolve, reject) => {
      const ecarFilePath = this.join(this.tempBaseFolder, this.ecarName + '.ecar');
      let output = fs.createWriteStream(ecarFilePath);
      output.on('close', () => {
        clearInterval(this.interval);
        console.log(this.parentArchive.pointer() + ' total bytes zipped');
        console.log('Took ', (Date.now() - this.startTime)/1000, 'seconds');
        console.log('Skipped corrupt content', this.corruptContents);
        resolve({
          ecarSize: this.parentArchive.pointer(),
          timeTaken: (Date.now() - this.startTime)/1000,
          skippedContent: this.corruptContents,
          name: this.ecarName,
          ecarFilePath
        });
      });
      output.on('end', () => {
        console.log('Data has been drained');
      });
      this.parentArchive.on('error', (err) => {
        reject(err);
      });
      this.parentArchive.finalize();
      this.parentArchive.pipe(output);
    })
  }
  async readDirectory(path){
    return new Promise((resolve, reject) => {
      fs.readdir(path, (err, items) => {
        if(err){
          reject(err);
          return;
        }
        resolve(items);
      })
    });
  }
}
