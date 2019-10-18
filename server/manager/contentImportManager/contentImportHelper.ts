// const ecarFileName = "Science - Part 2.ecar";
// const ecarFileName = "10 ಗಣಿತ ಭಾಗ 1.ecar";
import { IContentImport, ImportStatus, ImportSteps, IContentManifest } from './IContentImport'
const contentFolder = "./content/";
const ecarFolder = "./ecar/";
import * as  StreamZip from 'node-stream-zip';
import * as  fs from 'fs';
import * as  _ from 'lodash';
import * as path from 'path';
import * as glob from 'glob';
import * as fse from 'fs-extra';
let zipHandler;
let contentImportData: IContentImport;
let dbContents;

const copyEcar = () => {
  console.log('copping ecar from src location to ecar folder', contentImportData.ecarSourcePath);
  fs.copyFile(contentImportData.ecarSourcePath, ecarFolder + contentImportData.id + '.ecar', (err) => { // TODO: check source ecar path before copying
    if (err) {
      process.send({ message: "IMPORT_ERROR", err })
    } else {
      process.send({ message: ImportSteps.copyEcar, contentImportData })
    }
  })
}

const parseEcar = async () => {
  try {
    let ecarBasePath = ecarFolder + contentImportData.id + '.ecar';
    let contentBasePath = contentFolder + contentImportData.id
    zipHandler = await loadZipHandler(ecarBasePath);
    createDirectory(contentBasePath)
    const ecarContentEntries = zipHandler.entries();
    if (!ecarContentEntries['manifest.json']) {
      throw "MANIFEST_MISSING";
    }
    const manifestPath = getDestFilePath(ecarContentEntries['manifest.json']);
    await extractFile(zipHandler, manifestPath)
    contentImportData.manifest = JSON.parse(fs.readFileSync(contentBasePath + '/manifest.json', 'utf8'));
    let parent = _.get(contentImportData.manifest, 'archive.items[0]');
    if (_.get(parent, 'visibility') !== 'Default') {
      throw 'INVALID_MANIFEST'
    }
    if (parent.compatibilityLevel > 1) { // config.get("CONTENT_COMPATIBILITY_LEVEL")
      throw `UNSUPPORTED_COMPATIBILITY_LEVEL`;
    }
    contentImportData.contentId = parent.identifier;
    contentImportData.contentType = parent.mimeType;
    if (contentImportData.contentType === 'application/vnd.ekstep.content-collection') {
      contentImportData.childNodes = _.filter(_.get(contentImportData.manifest, 'archive.items'),
        item => (item.mimeType !== 'application/vnd.ekstep.content-collection'))
        .map(item => item.identifier)
    }
    contentImportData.extractedContentEntries = { 'manifest.json': true }
    process.send({ message: ImportSteps.parseEcar, contentImportData })
  } catch (err) {
    console.log('error while importing ecar', err);
    process.send({ message: "IMPORT_ERROR", err })
  }
}

const extractEcar = async () => {
  try {
    const dbRootContent = _.find(dbContents, { id: contentImportData.contentId })
    if (dbRootContent) {
      // TODO: if content already exist in app 
      // 1.check compatibility level and content version, if ecar has higher level then update 
      // 2.content version of childNodes of collection if update available update content
      // 3.new ecar has more content that imported ecar in app, add those missing content to app
      process.send({ message: ImportSteps.complete, contentImportData })
      return;
    }
    let ecarBasePath = ecarFolder + contentImportData.id + '.ecar';
    let contentBasePath = contentFolder + contentImportData.id
    console.log('contentBasePath and ecarBasePath in extractEcar', contentBasePath, ecarBasePath);
    console.log('ecarEntries extracted already', contentImportData.extractedContentEntries);
    if (!zipHandler) {
      zipHandler = await loadZipHandler(ecarBasePath);
    }
    let contentMap = {};
    let artifactToBeUnzipped = [];
    _.get(contentImportData.manifest, 'archive.items')
      .forEach(item => contentMap[item.identifier] = item);
    for (const entry of _.values(zipHandler.entries()) as any) {
      if (!contentImportData.extractedContentEntries[entry.name]) {
        const pathObj = getDestFilePath(entry, contentMap);
        if(entry.name.endsWith('.zip')){
          artifactToBeUnzipped.push(pathObj.dest);
        }
        await extractFile(zipHandler, pathObj)
        contentImportData.extractedContentEntries[entry.name] = true;
      } else {
        console.log('entry extracted already', entry);
      }
    }
    await unzipArtifacts(artifactToBeUnzipped);
    process.send({message: ImportSteps.extractEcar, contentImportData})
  } catch (err) {
    console.log('error while importing ecar', err);
    process.send({ message: "IMPORT_ERROR", err })
  } finally {
    console.log('extracted all contents');
    if (zipHandler.close) {
      zipHandler.close();
    }
  }
}
const unzipArtifacts = async (artifactToBeUnzipped = []) => {
  artifactToBeUnzipped.forEach(artifact => {
    if(contentImportData.artifactUnzipped[artifact]){
      contentImportData.artifactUnzipped[artifact] = true;
      // unzip artifact
    }
  })
}
const getDestFilePath = (entry, contentMap = {}) => {
  let patObj = {
    isDirectory: entry.isDirectory,
    src: entry.name,
    dest: contentFolder + contentImportData.id
  }
  const splitPath = _.union(_.compact(entry.name.split('/')))
  splitPath.forEach(content => {
    let contentMapped = contentMap[content];
    if (contentMapped) {
      if (contentMapped.mimeType !== 'application/vnd.ekstep.content-collection') {
        patObj.dest = contentFolder + content;
        return patObj;
      } else {
        patObj.dest = contentFolder + contentImportData.id + '/' + content;
      }
    }
  });
  console.log('-------------', patObj)
  return patObj;
}
const extractZipFiles = async () => {
  console.log('all child node extracted');
}
const extractFile = (zipHandler, pathDetails) => {
  return new Promise((resolve, reject) => {
    if (pathDetails.isDirectory) {
      return resolve(createDirectory(pathDetails.dest))
    }
    zipHandler.extract(pathDetails.src, pathDetails.dest, (err, count) => {
      if (err) {
        return reject(err)
      }
      resolve(count)
    });
  })
}
const loadZipHandler = async (path) => {
  const zip = new StreamZip({ file: path, storeEntries: true });
  return new Promise((resolve, reject) => {
    zip.on('ready', () => resolve(zip));
    zip.on('error', reject);
  })
}
const createDirectory = async (path) => {
  if (!fs.existsSync(path)) {
    fs.mkdirSync(path);
  }
}

process.on('message', (data) => {
  contentImportData = data.contentImportData;
  if (data.message === ImportSteps.copyEcar) {
    copyEcar()
  } else if (data.message === ImportSteps.parseEcar) {
    parseEcar()
  } else if (data.message === ImportSteps.extractEcar) {
    dbContents = data.dbContents;
    extractEcar();
  } else if (data.message === "KILL") {
    process.send({ message: "DATA_SYNC_KILL", contentImportData })
  }
});
