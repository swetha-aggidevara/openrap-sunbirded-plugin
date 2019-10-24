import { IContentImport, ImportSteps, ImportProgress } from './IContentImport'
import * as  StreamZip from 'node-stream-zip';
import * as  fs from 'fs';
import * as  _ from 'lodash';
import * as path from 'path';
import { manifest } from '../../manifest';
import { containerAPI } from 'OpenRAP/dist/api';
import config from '../../config';
import { BehaviorSubject, Subject } from 'rxjs';
import {debounceTime, throttleTime} from 'rxjs/operators';

let zipHandler;
let contentImportData: IContentImport;
let dbContents;
let fileSDK = containerAPI.getFileSDKInstance(manifest.id);
const contentFolder = fileSDK.getAbsPath('content');
const ecarFolder = fileSDK.getAbsPath('ecars');
let manifestJson;

const syncCloser = (initialProgress, percentage, totalSize = contentImportData.ecarFileSize) => {
  initialProgress = initialProgress ? initialProgress : contentImportData.importProgress;
  let completed = 1;
  const syncData$ = new Subject<number>();
  const subscription = syncData$.pipe(throttleTime(1000)).subscribe(data => {
    let newProgress = ((completed / totalSize) * percentage);
    contentImportData.importProgress = initialProgress + newProgress;
    process.send({ message: 'DATA_SYNC', contentImportData })
  });
  return (chunk = 0) => {
    completed += chunk;
    syncData$.next(completed);
    return subscription;
  }
}
const copyEcar = () => {
  try {
    console.info(contentImportData._id, 'copping ecar from src location to ecar folder', contentImportData.ecarSourcePath, ecarFolder);
    contentImportData.ecarFileSize = fs.statSync(contentImportData.ecarSourcePath).size;
    const syncFunc = syncCloser(ImportProgress.COPY_ECAR, 25);
    const toStream = fs.createWriteStream(path.join(ecarFolder, contentImportData._id + '.ecar'));
    const fromStream = fs.createReadStream(contentImportData.ecarSourcePath);
    fromStream.pipe(toStream);
    fromStream.on('data', buffer => syncFunc(buffer.length));
    toStream.on('finish', data => { 
      syncFunc().unsubscribe(); 
      process.send({ message: ImportSteps.copyEcar, contentImportData })
    });
    toStream.on('error', err => { 
      syncFunc().unsubscribe(); 
      process.send({ message: "IMPORT_ERROR", contentImportData, err })
    });
    fromStream.on('error', err => { 
      syncFunc().unsubscribe(); 
      process.send({ message: "IMPORT_ERROR", contentImportData, err })
    })
  } catch (err) {
    process.send({ message: "IMPORT_ERROR", contentImportData, err })
  }
}

const parseEcar = async () => {
  try {
    let ecarBasePath = path.join(ecarFolder, contentImportData._id + '.ecar');
    let contentBasePath = path.join(contentFolder, contentImportData._id); // temp path
    zipHandler = await loadZipHandler(ecarBasePath);
    await fileSDK.mkdir(path.join('content', contentImportData._id));
    const ecarContentEntries = zipHandler.entries();
    if (!ecarContentEntries['manifest.json']) {
      throw "MANIFEST_MISSING";
    }
    await extractFile(zipHandler, getDestFilePath(ecarContentEntries['manifest.json'], contentImportData._id))
    manifestJson = await fileSDK.readJSON(path.join(contentBasePath, 'manifest.json'))
    let parent = _.get(manifestJson, 'archive.items[0]');
    if (_.get(parent, 'visibility') !== 'Default') {
      throw 'INVALID_MANIFEST'
    }
    if (parent.compatibilityLevel > config.get("CONTENT_COMPATIBILITY_LEVEL")) {
      throw `UNSUPPORTED_COMPATIBILITY_LEVEL`;
    }
    contentImportData.contentId = parent.identifier;
    contentImportData.contentType = parent.mimeType;
    if (contentImportData.contentType === 'application/vnd.ekstep.content-collection') {
      contentImportData.childNodes = _.filter(_.get(manifestJson, 'archive.items'),
        item => (item.mimeType !== 'application/vnd.ekstep.content-collection'))
        .map(item => item.identifier)
    }
    process.send({ message: ImportSteps.parseEcar, contentImportData });
  } catch (err) {
    process.send({ message: "IMPORT_ERROR", err });
  }
}

const extractEcar = async () => {
  try {
    const dbRootContent = _.find(dbContents, { identifier: contentImportData.contentId })
    if (dbRootContent) {
      // TODO: if content already exist in app 
      // 1.check compatibility level and content version, if ecar has higher level then update 
      // 2.content version of childNodes of collection if update available update content
      // 3.new ecar has more content that imported ecar in app, add those missing content to app
      process.send({ message: ImportSteps.complete, contentImportData })
      return;
    }
    let ecarBasePath = path.join(ecarFolder, contentImportData._id + '.ecar');
    await fileSDK.mkdir(path.join('content', contentImportData.contentId));
    if (!zipHandler) {
      zipHandler = await loadZipHandler(ecarBasePath);
    }
    let contentMap = {};
    let artifactToBeUnzipped = [];
    let artifactToBeUnzippedSize = 0;
    if(!manifestJson){
      manifestJson = await fileSDK.readJSON(path.join(path.join(contentFolder, contentImportData._id), 'manifest.json'))
    }
    _.get(manifestJson, 'archive.items').forEach(item => contentMap[item.identifier] = item); // maps all content to object
    const syncFunc = syncCloser(ImportProgress.EXTRACT_ECAR ,65);
    for (const entry of _.values(zipHandler.entries()) as any) {
      syncFunc(entry.compressedSize)
      if (!contentImportData.extractedEcarEntries[entry.name]) {
        const pathObj = getDestFilePath(entry, contentImportData.contentId, contentMap);
        if (entry.name.endsWith('.zip')) {
          artifactToBeUnzippedSize += entry.compressedSize;
          artifactToBeUnzipped.push({ 
            src: path.join(pathObj.destRelativePath, path.basename(entry.name)),
            size: entry.compressedSize
          });
        }
        await extractFile(zipHandler, pathObj);
        contentImportData.extractedEcarEntries[entry.name] = true;
      }
    }
    syncFunc().unsubscribe();
    console.info(contentImportData._id, 'ecar extracted')
    await unzipArtifacts(artifactToBeUnzipped, artifactToBeUnzippedSize);
    removeFile(path.join('ecars', contentImportData._id + '.ecar'));
    removeFile(path.join('content', contentImportData._id));
    console.info(contentImportData._id, 'artifacts unzipped')
    process.send({ message: ImportSteps.extractEcar, contentImportData })
  } catch (err) {
    process.send({ message: "IMPORT_ERROR", err })
  } finally {
    zipHandler.close && zipHandler.close();
  }
}
const removeFile = (location) => {
  fileSDK.remove(location)
      .catch(err => console.log('error while deleting ecar folder', location))
}
const unzipFile = async (src, dest = path.dirname(src)) => {
  await fileSDK.unzip(src, dest, false).catch(err => console.log('error while unzip file', src))

}
const unzipArtifacts = async (artifactToBeUnzipped = [], artifactToBeUnzippedSize) => {
  const syncFunc = syncCloser(ImportProgress.EXTRACT_ARTIFACT, 9, artifactToBeUnzippedSize);
  for (const artifact of artifactToBeUnzipped) {
    syncFunc(artifact.size)
    if (!contentImportData.artifactUnzipped[artifact.src]) {
      await unzipFile(artifact.src);
      removeFile(artifact.src);
      contentImportData.artifactUnzipped[artifact.src] = true;
    }
  }
  syncFunc().unsubscribe();
}
const getDestFilePath = (entry, id, contentMap = {}) => {
  let patObj = {
    isDirectory: entry.isDirectory,
    src: entry.name,
    dest: path.join(contentFolder, id),
    destRelativePath: path.join('content', id)
  }
  const splitPath = _.union(_.compact(entry.name.split('/')));
  splitPath.forEach((content: string) => {
    let contentMapped = contentMap[content];
    if (contentMapped) {
      if (contentMapped.mimeType !== 'application/vnd.ekstep.content-collection') {
        patObj.dest = path.join(contentFolder, content);
        patObj.destRelativePath = path.join('content', content);
        return patObj;
      } else {
        if(content === id){ // extract parent content to root dir
          patObj.dest = path.join(contentFolder, content);
          patObj.destRelativePath = path.join('content', content);
        } else {
          patObj.dest = path.join(contentFolder, id, content);
          patObj.destRelativePath = path.join('content', id, content);
        }
      }
    }
  });
  return patObj;
}
const extractFile = (zipHandler, pathDetails) => {
  return new Promise(async (resolve, reject) => {
    if (pathDetails.isDirectory) {
      return await fileSDK.mkdir(pathDetails.destRelativePath).then(() => resolve()).catch(reject)
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
    if (zipHandler && zipHandler.close) {
      zipHandler.close();
    }
    process.send({ message: "DATA_SYNC_KILL", contentImportData })
  }
});
