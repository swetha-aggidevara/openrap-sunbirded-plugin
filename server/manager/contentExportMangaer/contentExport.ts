import * as  fs from 'fs';
import * as archiver from 'archiver';
import * as path from 'path';
import * as  _ from 'lodash';

const createDirect = async (path) => {
  if (!fs.existsSync(path)){
    fs.mkdirSync(path);
  }
}
createDirect('temp');

class ExportContent {
  tempBaseFolder = 'temp';
  contentBaseFolder = 'content';
  parentArchive;
  parentManifest;
  parentDetails;
  ecarName;
  constructor(public contentId = 'do_31275124190583193617067'){
    this.parentArchive = archiver('zip', { zlib: { level: 9 }});
  }
  public async export(){
    this.parentManifest = JSON.parse(fs.readFileSync(path.join(this.contentBaseFolder, this.contentId,  'manifest.json'), 'utf8'))
    this.parentDetails = _.get(this.parentManifest, 'archive.items[0]');
    this.ecarName =  this.parentDetails.name;
    console.log('--------exporting content of mimeType--------', this.parentDetails.mimeType);
    if (this.parentDetails.mimeType === 'application/vnd.ekstep.content-collection') {
      await this.loadParentCollection();
    } else {
      await this.loadContent(this.parentDetails, false);
    }
    this.streamZip();
  }
  archiveAppend(type, src, dest){
    console.log(`Adding ${src} of type ${type} to dest folder ${dest}`);
    if(type === 'path'){
      this.parentArchive.append(fs.createReadStream(src), { name: dest });
    } else if (type === 'directory'){
      this.parentArchive.directory(src, dest);
    } else if (type === 'stream'){
      this.parentArchive.append(src, { name: dest });
    }
  }
  async loadContent(contentDetails, child){
    const baseDestPath = child ? contentDetails.identifier + '/' : '';
    this.archiveAppend('path', path.join('content', contentDetails.identifier, 'manifest.json'), baseDestPath + 'manifest.json');
    if(contentDetails.appIcon){
      const appIconFileName = path.basename(contentDetails.appIcon);
      const appIcon = path.join('content', contentDetails.identifier, appIconFileName);
      this.archiveAppend('path', appIcon, baseDestPath + contentDetails.appIcon);
    }
    if(contentDetails.artifactUrl && path.extname(contentDetails.artifactUrl) && path.extname(contentDetails.artifactUrl) !== '.zip'){
      const artifactUrlName = path.basename(contentDetails.artifactUrl);
      const artifactUrlPath = path.join('content', contentDetails.identifier, artifactUrlName);
      this.archiveAppend('path', artifactUrlPath, baseDestPath + contentDetails.artifactUrl);
    } else if(contentDetails.artifactUrl && path.extname(contentDetails.artifactUrl) && path.extname(contentDetails.artifactUrl) === '.zip'){
      await this.loadZipContent(contentDetails, true);
    }
  }
  async loadZipContent(contentDetails, child){
    const baseDestPath = child ? contentDetails.identifier + '/' : '';
    const childArchive = archiver('zip', { zlib: { level: 9 }});
    const toBeZipped: any = await this.readDirectory(path.join('content', contentDetails.identifier));
    for(const items of toBeZipped){
      console.log('--------------loadZipContent------------', items)
      if(!contentDetails.appIcon.includes(items) && items !== 'manifest.json'){
        if(path.extname(items)){
          childArchive.append(fs.createReadStream(path.join('content', contentDetails.identifier, items)), { name: items });
        } else {
          childArchive.directory(path.join('content', contentDetails.identifier, items), items);
        }
      }
    }
    childArchive.finalize();
    this.archiveAppend('stream', childArchive, baseDestPath + contentDetails.artifactUrl);
  }
  async loadParentCollection(){
    if(this.parentDetails.appIcon){
      const appIconFileName = path.basename(this.parentDetails.appIcon);
      const appIcon = path.join('content', this.parentDetails.identifier, appIconFileName);
      this.archiveAppend('path', appIcon, this.parentDetails.appIcon);
    }
    const collectionItems: any = await this.readDirectory(path.join('content', this.parentDetails.identifier));
    for(const items of collectionItems){
      if(!this.parentDetails.appIcon.includes(items)){
        if(path.extname(items)){
          this.archiveAppend('path', path.join('content', this.parentDetails.identifier, items), items);
        } else {
          this.archiveAppend('directory', path.join('content', this.parentDetails.identifier, items), items);
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
        // childNodes = ['do_312694002009702400125', 'do_31274997498435993616910'];
    for(const child of childNodes){
      const childManifest = JSON.parse(fs.readFileSync(path.join(this.contentBaseFolder, child,  'manifest.json'), 'utf8'));
      const childDetails = _.get(childManifest, 'archive.items[0]');
      await this.loadContent(childDetails, true);
    }
  }
  streamZip(){
    let output = fs.createWriteStream(path.join('temp', this.ecarName + '.zip'));
    output.on('close', () => {
      console.log(this.parentArchive.pointer() + ' total bytes');
      console.log('archiver has been finalized and the output file descriptor has closed.');
    });

    output.on('end', () => {
      console.log('Data has been drained');
    });

    this.parentArchive.on('warning', (err) => {
      if (err.code === 'ENOENT') {
        // log warning
      } else {
        // throw error
        throw err;
      }
    });
    this.parentArchive.on('error', function (err) {
      throw err;
    });
    this.parentArchive.finalize();
    this.parentArchive.pipe(output);
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

const exportMan = new ExportContent();

exportMan.export();