import { IContentImport, ImportStatus, ImportSteps, IContentManifest } from './IContentImport'
import * as  StreamZip from 'node-stream-zip';
import * as  fs from 'fs';
import * as  _ from 'lodash';
import * as path from 'path';
import { manifest } from '../../manifest';
import { containerAPI } from 'OpenRAP/dist/api';
import config from '../../config';

let zipHandler;
let contentImportData: IContentImport;
let dbContents;
let fileSDK = containerAPI.getFileSDKInstance(manifest.id);
const contentFolder = fileSDK.getAbsPath('content');
const ecarFolder = fileSDK.getAbsPath('ecars');
const copyEcar = () => {
  console.log('copping ecar from src location to ecar folder', contentImportData.ecarSourcePath, ecarFolder);
  fs.copyFile(contentImportData.ecarSourcePath, path.join(ecarFolder, contentImportData.id + '.ecar'), (err) => { // TODO: check source ecar path before copying
    if (err) {
      console.log(err);
      process.send({ message: "IMPORT_ERROR", contentImportData, err })
    } else {
      process.send({ message: ImportSteps.copyEcar, contentImportData })
    }
  })
}

const parseEcar = async () => {
  try {
    let ecarBasePath = path.join(ecarFolder, contentImportData.id + '.ecar');
    let contentBasePath = path.join(contentFolder, contentImportData.id)
    zipHandler = await loadZipHandler(ecarBasePath);
    createDirectory(contentBasePath)
    const ecarContentEntries = zipHandler.entries();
    if (!ecarContentEntries['manifest.json']) {
      throw "MANIFEST_MISSING";
    }
    const manifestPath = getDestFilePath(ecarContentEntries['manifest.json']);
    await extractFile(zipHandler, manifestPath)
    contentImportData.manifest = JSON.parse(fs.readFileSync(path.join(contentBasePath, 'manifest.json'), 'utf8'));
    let parent = _.get(contentImportData.manifest, 'archive.items[0]');
    if (_.get(parent, 'visibility') !== 'Default') {
      throw 'INVALID_MANIFEST'
    }
    if (parent.compatibilityLevel > config.get("CONTENT_COMPATIBILITY_LEVEL")) {
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
    contentImportData.artifactUnzipped = {};
    process.send({ message: ImportSteps.parseEcar, contentImportData })
  } catch (err) {
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
    let ecarBasePath = path.join(ecarFolder, contentImportData.id + '.ecar');
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
        if (entry.name.endsWith('.zip')) {
          artifactToBeUnzipped.push(path.join(pathObj.destRelativePath, path.basename(entry.name)));
        }
        await extractFile(zipHandler, pathObj)
        contentImportData.extractedContentEntries[entry.name] = true;
      }
    }
    console.info('ecar extracted for importId', contentImportData.id)
    await unzipArtifacts(artifactToBeUnzipped);
    await fileSDK.remove(path.join('ecars', contentImportData.id + '.ecar'))
      .catch(err => console.log('error while deleting ecar folder'))
    console.info('artifacts unzipped for importId', contentImportData.id)
    process.send({ message: ImportSteps.extractEcar, contentImportData })
  } catch (err) {
    process.send({ message: "IMPORT_ERROR", err })
  } finally {
    if (zipHandler.close) {
      zipHandler.close();
    }
  }
}
const unzipArtifacts = async (artifactToBeUnzipped = []) => {
  for (const artifact of artifactToBeUnzipped) {
    if (!contentImportData.artifactUnzipped[artifact]) {
      await fileSDK.unzip(artifact, path.dirname(artifact), false)
        .catch(err => console.log('error while unzip file', artifact))
      await fileSDK.remove(artifact)
        .catch(err => console.log('error while deleting zip file', artifact))
      contentImportData.artifactUnzipped[artifact] = true;
    }
  }
}
const getDestFilePath = (entry, contentMap = {}) => {
  let patObj = {
    isDirectory: entry.isDirectory,
    src: entry.name,
    dest: path.join(contentFolder, contentImportData.id),
    destRelativePath: path.join('content', contentImportData.id)
  }
  const splitPath = _.union(_.compact(entry.name.split('/')))
  splitPath.forEach((content: string) => {
    let contentMapped = contentMap[content];
    if (contentMapped) {
      if (contentMapped.mimeType !== 'application/vnd.ekstep.content-collection') {
        patObj.dest = path.join(contentFolder, content);
        patObj.destRelativePath = path.join('content', content);
        return patObj;
      } else {
        patObj.dest = path.join(contentFolder, contentImportData.id, content);
        patObj.destRelativePath = path.join('content', contentImportData.id, content);
      }
    }
  });
  return patObj;
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
  if (_.includes([ImportSteps.copyEcar, ImportSteps.parseEcar, ImportSteps.extractEcar], data.message)) {
    contentImportData = data.contentImportData;
  }
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
