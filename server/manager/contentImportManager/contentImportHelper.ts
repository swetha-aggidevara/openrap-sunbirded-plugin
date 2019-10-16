// const ecarFileName = "Science - Part 2.ecar";
// const ecarFileName = "10 ಗಣಿತ ಭಾಗ 1.ecar";
import {IContentImport, ImportStatus, ImportSteps, IContentManifest} from './IContentImport'
const contentFolder = "./content/";
const ecarFolder = "./ecar/";
import * as  StreamZip from 'node-stream-zip';
import * as  fs from 'fs';
import * as  _ from 'lodash';
let zipHandler;
let contentImportData: IContentImport;
let dbContents;
const copyEcar = () => {
  console.log('copping ecar from src location to ecar folder', contentImportData.ecarSourcePath);
  fs.copyFile(contentImportData.ecarSourcePath, ecarFolder + contentImportData.id + '.ecar', (err) => { // TODO: check source ecar path before copying
    if (err) {
      process.send({message: "IMPORT_ERROR", err})
    } else {
      process.send({message: ImportSteps.copyEcar, contentImportData})
    }
  })
}
const parseEcar = async () => {
  let ecarBasePath = ecarFolder + contentImportData.id + '.ecar';
  let contentBasePath = contentFolder + contentImportData.id
  try {
    zipHandler = await loadZip(ecarBasePath);
    createDirectory(contentBasePath)
    contentImportData.ecarContentEntries = zipHandler.entries();
    if(!contentImportData.ecarContentEntries['manifest.json']){
      throw "MANIFEST_MISSING";
    }
    await extractFile(zipHandler, contentBasePath, contentImportData.ecarContentEntries['manifest.json'])
    contentImportData.manifest = JSON.parse(fs.readFileSync(contentFolder + '/' + contentImportData.id + '/manifest.json', 'utf8'));
    let parent = _.get(contentImportData.manifest, 'archive.items[0]');
    if (_.get(parent, 'visibility') !== 'Default') {
      throw 'INVALID_MANIFEST'
    }
    if (parent.compatibilityLevel > 1) { // config.get("CONTENT_COMPATIBILITY_LEVEL")
      throw `UNSUPPORTED_COMPATIBILITY_LEVEL`;
    }
    contentImportData.contentId = parent.identifier;
    contentImportData.contentType = parent.mimeType;
    if(contentImportData.contentType === 'application/vnd.ekstep.content-collection'){
      contentImportData.childNodes = _.filter(_.get(contentImportData.manifest, 'archive.items'), item => (item.mimeType !== 'application/vnd.ekstep.content-collection'))
      .map(item => item.identifier)
    }
    contentImportData.extractedEntries = { 'manifest.json': true }
    process.send({message: ImportSteps.parseEcar, contentImportData})
  } catch (err) {
    console.log('error while importing ecar', err);
    process.send({message: "IMPORT_ERROR", err})
  }
}

const processContents = async () => {
  const dbRootContent = _.find(dbContents, {id: contentImportData.contentId})
  if(dbRootContent){
    // TODO: if content already exist in app 
    // 1.check compatibility level, if ecar has higher level then update 
    // 2.compatibility level of childNodes of collection if update available update content
    // 3.collection ecar has more content ecar that in app, add those missing content to app
    // this.cb(null, this.contentImportData);
    process.send({message: ImportSteps.complete, contentImportData})
    return;
  }
  extractEcar();
  // if (contentImportData.contentType === 'application/vnd.ekstep.content-collection') {
  //   let itemsClone = _.cloneDeep(_.get(this.manifest, 'archive.items'));
  //   parent.children = this.createHierarchy(itemsClone, parent);
  //   parent.baseDir = `content/${parent.identifier}`;
  //   parent.desktopAppMetadata = {
  //     // "ecarFile": resource.identifier + '.ecar',  // relative to ecar folder
  //     "addedUsing": 'IMPORT',// IAddedUsingType.import,
  //     "createdOn": Date.now(),
  //     "updatedOn": Date.now(),
  //   }
  //   resources = _.filter(_.get(this.manifest, 'archive.items'), item => (item.mimeType !== 'application/vnd.ekstep.content-collection'))
  //     .map(resource => {
  //       resource.baseDir = `content/${resource.identifier}`;
  //       resource.desktopAppMetadata = {
  //         // "ecarFile": resource.identifier + '.ecar',  // relative to ecar folder
  //         "addedUsing": 'IMPORT',// IAddedUsingType.import,
  //         "createdOn": Date.now(),
  //         "updatedOn": Date.now(),
  //       }
  //       resource.appIcon = resource.appIcon ? `content/${resource.appIcon}` : resource.appIcon;
  //       return resource;
  //     });
  // }
  // await this.updateStatusInDB();
}

const extractEcar = async () => {
  let ecarBasePath = ecarFolder + contentImportData.id + '.ecar';
  let contentBasePath = contentFolder + contentImportData.id
  console.log('contentBasePath and ecarBasePath in extractEcar', contentBasePath, ecarBasePath);
  console.log('ecarEntries in extractEcar', contentImportData.extractedEntries);
  try {
    if(!zipHandler){
      zipHandler = await loadZip(ecarBasePath);
    }
    for (const entry of _.values(zipHandler.entries()) as any) {
      if(!contentImportData.extractedEntries[entry.name]){
        // console.log(`extracting Name: ${entry.name} `) //, contentBasePath,  ecarEntries[entry.name]) //, type: ${desc}, size: ${entry.size}`);
        contentImportData.extractedEntries[entry.name] = true;
        await extractFile(zipHandler, contentBasePath, entry)
      } else {
        console.log('entry extracted already', entry);
      }
    }
    process.send({message: ImportSteps.extractEcar, contentImportData})
  } catch (err) {
    console.log('error while importing ecar', err);
    process.send({message: "IMPORT_ERROR", err})
  } finally {
    console.log('extracted all contents');
    if(zipHandler.close){
      zipHandler.close();
    }
  }
}

const extractFile = (zipHandler, dest, entry) => {
  return new Promise((resolve, reject) => {
    if(entry.isDirectory){
      return resolve(createDirectory(dest + '/' + entry.name.slice(0, entry.name.length - 1)))
    }
    zipHandler.extract(entry.name, dest + '/' + entry.name, (err, count) => {
      if(err){
        return reject(err)
      }
      resolve(count)
    });
  })
}
const loadZip = async (path) => {
  const zip = new StreamZip({ file: path, storeEntries: true });
  return new Promise((resolve, reject) => {
    zip.on('ready', () => resolve(zip));
    zip.on('error', reject);
  })
}
const createDirectory = async (path) => {
  if (!fs.existsSync(path)){
    fs.mkdirSync(path);
  }
}

process.on('message', (data) => {
  contentImportData = data.contentImportData;
  if (data.message === ImportSteps.copyEcar) {
    copyEcar()
  } else if(data.message === ImportSteps.parseEcar) {
    parseEcar()
  } else if (data.message === ImportSteps.extractEcar) {
    dbContents = data.dbContents;
    processContents();
  } else if (data.message === "KILL") {
    process.send({message: "DATA_SYNC_KILL", contentImportData})
  }
});
