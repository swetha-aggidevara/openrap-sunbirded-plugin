import { IContentImport, ImportSteps, ImportProgress, getErrorObj, handelError, ErrorObj } from './IContentImport'
import * as  StreamZip from 'node-stream-zip';
import * as  fs from 'fs';
import * as  _ from 'lodash';
import * as path from 'path';
import { manifest } from '../../manifest';
import { containerAPI } from 'OpenRAP/dist/api';
import config from '../../config';
import { Subject } from 'rxjs';
import { throttleTime} from 'rxjs/operators';
const collectionMimeType = 'application/vnd.ekstep.content-collection';
let zipHandler;
let contentImportData: IContentImport;
let dbContents;
let fileSDK = containerAPI.getFileSDKInstance(manifest.id);
const contentFolder = fileSDK.getAbsPath('content');
const ecarFolder = fileSDK.getAbsPath('ecars');
let manifestJson;

const syncCloser = (initialProgress, percentage, totalSize = contentImportData.contentSize) => {
  initialProgress = initialProgress ? initialProgress : contentImportData.progress;
  let completed = 1;
  const syncData$ = new Subject<number>();
  const subscription = syncData$.pipe(throttleTime(2500)).subscribe(data => {
    let newProgress = ((completed / totalSize) * percentage);
    contentImportData.progress = initialProgress + newProgress;
    sendMessage("DATA_SYNC");
  });
  return (chunk = 0) => {
    completed += chunk;
    syncData$.next(completed);
    return subscription;
  }
}

const copyEcar = async () => {
  try {
    process.send({message: "LOG", logType: "info", logBody: [contentImportData._id, 'copping ecar from src location to ecar folder', contentImportData.ecarSourcePath, ecarFolder] });
    const syncFunc = syncCloser(ImportProgress.COPY_ECAR, 25);
    const toStream = fs.createWriteStream(path.join(ecarFolder, contentImportData._id + '.ecar'));
    const fromStream = fs.createReadStream(contentImportData.ecarSourcePath);
    fromStream.pipe(toStream);
    fromStream.on('data', buffer => syncFunc(buffer.length));
    toStream.on('finish', data => {
      syncFunc().unsubscribe();
      contentImportData.progress = ImportProgress.PARSE_ECAR
      sendMessage(ImportSteps.copyEcar)
    });
    toStream.on('error', err => { 
      syncFunc().unsubscribe(); 
      sendMessage("IMPORT_ERROR", getErrorObj(err, "UNHANDLED_COPY_ECAR_ERROR"))
    });
    fromStream.on('error', err => { 
      syncFunc().unsubscribe(); 
      sendMessage("IMPORT_ERROR", getErrorObj(err, "UNHANDLED_COPY_ECAR_ERROR"))
    })
  } catch (err) {
    sendMessage("IMPORT_ERROR", getErrorObj(err, "UNHANDLED_COPY_ECAR_ERROR"))
  }
}

const parseEcar = async () => {
  try {
    let ecarBasePath = path.join(ecarFolder, contentImportData._id + '.ecar');
    let contentBasePath = path.join(contentFolder, contentImportData._id); // temp path
    zipHandler = await loadZipHandler(ecarBasePath).catch(handelError('LOAD_ECAR'));
    await fileSDK.mkdir(path.join('content', contentImportData._id));
    const ecarContentEntries = zipHandler.entries();
    const manifestEntry = ecarContentEntries['manifest.json'] || ecarContentEntries['/manifest.json'];
    if (!manifestEntry) {
      throw getErrorObj({ message: "manifest.json is missing in ecar" }, "MANIFEST_MISSING");
    }
    await new Promise((res, rej) => zipHandler.extract(manifestEntry.name, contentBasePath, err => err ? rej(err) : res()))
    manifestJson = await fileSDK.readJSON(path.join(contentBasePath, 'manifest.json'))
    let parent = _.get(manifestJson, 'archive.items[0]');
    if (_.get(parent, 'visibility') !== 'Default') {
      throw getErrorObj({ message: `manifest.json dosn't contain content with visibility Default` }, "INVALID_MANIFEST");
    }
    if (parent.compatibilityLevel > config.get("CONTENT_COMPATIBILITY_LEVEL")) {
      throw getErrorObj({ message: `${parent.compatibilityLevel} not supported. Required ${config.get("CONTENT_COMPATIBILITY_LEVEL")} and below` }, "UNSUPPORTED_COMPATIBILITY_LEVEL");
    }
    contentImportData.contentId = parent.identifier;
    contentImportData.mimeType = parent.mimeType;
    contentImportData.pkgVersion = _.toString(parent.pkgVersion) || '1.0';
    if (contentImportData.mimeType === 'application/vnd.ekstep.content-collection') {
      contentImportData.childNodes = _.filter(_.get(manifestJson, 'archive.items'),
        item => (item.mimeType !== 'application/vnd.ekstep.content-collection'))
        .map(item => item.identifier)
    }
    contentImportData.progress = ImportProgress.EXTRACT_ECAR;
    sendMessage(ImportSteps.parseEcar)
  } catch (err) {
    sendMessage("IMPORT_ERROR", getErrorObj(err, "UNHANDLED_PARSE_ECAR_ERROR"))
  }
}
const extractEcar = async () => {
  try {
    const corruptContent = [];
    if (!zipHandler) {
      zipHandler = await loadZipHandler(path.join(ecarFolder, contentImportData._id + '.ecar')).catch(handelError('LOAD_ECAR'));
    }
    if(!manifestJson){
      manifestJson = await fileSDK.readJSON(path.join(contentFolder, contentImportData._id, 'manifest.json'))
    }
    const syncFunc = syncCloser(ImportProgress.EXTRACT_ECAR ,65);
    const artifactToBeUnzipped = [];
    let artifactToBeUnzippedSize = 0;
    const zipEntries = zipHandler.entries();
    const extractContent = async (content, parent, collection) => {
      const contentBasePath = (collection && !parent) ? [contentImportData.contentId, content.identifier]: [content.identifier];
      await fileSDK.mkdir(path.join('content', path.join(...contentBasePath)));
      const appIconFile = parent ? content.appIcon : content.identifier + '/' + content.appIcon;
      const appIconEntry = zipEntries[appIconFile] || zipEntries['/' + appIconFile]
      if(appIconEntry && !contentImportData.extractedEcarEntries[appIconEntry.name]){
        await extractEntry(appIconEntry.name, path.join(contentFolder, ...contentBasePath));
        contentImportData.extractedEcarEntries[appIconEntry.name] = true;
        syncFunc(appIconEntry.compressedSize);
      }
      if(!parent && collection){
        return;
      }
      const manifestFile = parent ? 'manifest.json' : content.identifier + '/manifest.json';
      const manifestEntry = zipEntries[manifestFile] || zipEntries['/' + manifestFile];
      if (!manifestEntry) {
        corruptContent.push({ id: content.identifier, reason: 'MANIFEST_MISSING'});
        return;
      }
      if(!contentImportData.extractedEcarEntries[manifestEntry.name]){
        await extractEntry(manifestEntry.name, path.join(contentFolder, ...contentBasePath));
        contentImportData.extractedEcarEntries[manifestEntry.name] = true;
        syncFunc(manifestEntry.compressedSize);
      }
      if(collection || (content.artifactUrl && !path.extname(content.artifactUrl))){
        return;
      }
      const artifactFile = parent ? content.artifactUrl : content.identifier + '/' + content.artifactUrl;
      const artifactEntry = zipEntries[artifactFile] || zipEntries['/' + artifactFile]
      if (!artifactEntry) {
        corruptContent.push({ id: content.identifier, reason: 'ARTIFACT_MISSING'});
        return;
      }
      if(!contentImportData.extractedEcarEntries[artifactEntry.name]){
        await extractEntry(artifactEntry.name, path.join(contentFolder, ...contentBasePath));
        contentImportData.extractedEcarEntries[artifactEntry.name] = true;
        syncFunc(artifactEntry.compressedSize);
      }
      if (artifactEntry.name.endsWith('.zip')) {
        artifactToBeUnzippedSize += artifactEntry.compressedSize;
        artifactToBeUnzipped.push({
          src: path.join('content', ...contentBasePath, path.basename(artifactEntry.name)),
          size: artifactEntry.compressedSize
        });
      }
    }
    for(const content of _.get(manifestJson, 'archive.items')){
      const dbContent = _.find(dbContents, { identifier: content.identifier })
      if(!dbContent){
        await extractContent(content, (content.identifier === contentImportData.contentId), (content.mimeType === collectionMimeType));
      }
    }
    syncFunc().unsubscribe();
    const hierarchyEntry = zipEntries['hierarchy.json'] || zipEntries['/hierarchy.json'];
    if (hierarchyEntry) {
      await extractEntry(hierarchyEntry.name, path.join(contentFolder, contentImportData.contentId));
    }
    process.send({message: "LOG", logType: "info", logBody: [contentImportData._id, 'ecar extracted']})
    await unzipArtifacts(artifactToBeUnzipped, artifactToBeUnzippedSize).catch(handelError('EXTRACT_ARTIFACTS'));
    await removeFile(path.join('ecars', contentImportData._id + '.ecar'));
    await removeFile(path.join('content', contentImportData._id));
    process.send({message: "LOG", logType: "info", logBody: [contentImportData._id, 'artifacts unzipped']})
    contentImportData.progress = ImportProgress.PROCESS_CONTENTS;
    sendMessage(ImportSteps.extractEcar)
  } catch (err) {
    sendMessage("IMPORT_ERROR", getErrorObj(err, "UNHANDLED_EXTRACT_ECAR_ERROR"))
  } finally {
    zipHandler.close && zipHandler.close();
  }
}
const extractEntry = async (src, dest) => {
  await new Promise(async (resolve, reject) => 
    zipHandler.extract(src, dest, err => err ? reject(err) : resolve('SUCCESS')))
}

const removeFile = (location) => {
  return fileSDK.remove(location)
    .catch(err => process.send({message: "LOG", logType: "error", logBody: [contentImportData._id, 'error while deleting ecar folder', location]}))
}
const unzipFile = async (src, dest = path.dirname(src)) => {
  await fileSDK.unzip(src, dest, false)
    .catch(err => process.send({message: "LOG", logType: "error", logBody: [contentImportData._id, 'error while unzip file', src]}))
}
const unzipArtifacts = async (artifactToBeUnzipped = [], artifactToBeUnzippedSize) => {
  const syncFunc = syncCloser(ImportProgress.EXTRACT_ARTIFACT, 9, artifactToBeUnzippedSize);
  for (const artifact of artifactToBeUnzipped) {
    syncFunc(artifact.size)
    if (!contentImportData.artifactUnzipped[artifact.src]) {
      await unzipFile(artifact.src);
      await removeFile(artifact.src);
      contentImportData.artifactUnzipped[artifact.src] = true;
    }
  }
  syncFunc().unsubscribe();
}

const loadZipHandler = async (path) => {
  const zip = new StreamZip({ file: path, storeEntries: true, skipEntryNameValidation: true });
  return new Promise((resolve, reject) => {
    zip.on('ready', () => resolve(zip));
    zip.on('error', reject);
  })
}
const sendMessage = (message: string, err?: ErrorObj) => {
  const messageObj: any = {
    message, contentImportData,
  }
  if(err){
    messageObj.err = err;
  }
  process.send(messageObj)
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
    sendMessage("DATA_SYNC_KILL");
  }
});
