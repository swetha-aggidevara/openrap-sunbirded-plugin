// const ecarFileName = "Science - Part 2.ecar";
// const ecarFileName = "10 ಗಣಿತ ಭಾಗ 1.ecar";
const contentFolder = "./content/";
const ecarFolder = "./ecar/";
import * as  StreamZip from 'node-stream-zip';
import * as  fs from 'fs';
import * as  _ from 'lodash';
let zipHandler;

enum ImportSteps {
  copyEcar = "COPY_ECAR",
  parseEcar = "PARSE_ECAR",
  processManifest = "PROCESS_MANIFEST",
  extractEcar = "EXTRACT_ECAR",
  processContent = "PROCESS_CONTENT",
  saveContent = "SAVE_CONTENT"
}

enum ImportStatus {
  inQueue = "IN_QUEUE",
  resume = "RESUME",
  inProgress = "IN_PROGRESS",
  paused = "PAUSED",
  completed = "COMPLETED",
  failed = "FAILED",
  canceled = "CANCELED",
  reconcile = "RECONCILE"
}

interface IContentImport {
  id: string;
  importStatus: ImportStatus;
  createdOn: string | number;
  ecarSourcePath: string;
  contentId?: string;
  contentType?: string;
  importStep?: ImportSteps;
  ecarContentEntries?: Object;
  extractedEntries?: Object;
  contentToBeAdded?: Object;
  contentToBeUpdated?: Object;
  failedReason?: string;
}
const copyEcar = (contentImportData: IContentImport) => {
  console.log('copping ecar from src location to ecar folder', contentImportData.ecarSourcePath);
  fs.copyFile(contentImportData.ecarSourcePath, ecarFolder + contentImportData.id + '.ecar', (err) => { // TODO: check source ecar path before copying
    if (err) {
      process.send({message: "IMPORT_ERROR", err})
    } else {
      process.send({message: ImportSteps.copyEcar, contentImportData})
    }
  })
}
const parseEcar = async (contentImportData: IContentImport) => {
  let ecarBasePath = ecarFolder + contentImportData.id + '.ecar';
  let contentBasePath = contentFolder + contentImportData.id
  try {
    zipHandler = await loadZip(ecarBasePath);
    createDirectory(contentBasePath)
    contentImportData.ecarContentEntries = zipHandler.entries();
    if(!contentImportData.ecarContentEntries['manifest.json']){
      throw "MANIFEST_MISSING";
    }
    await extractContent(zipHandler, contentBasePath, contentImportData.ecarContentEntries['manifest.json'])
    process.send({message: ImportSteps.parseEcar, contentImportData})
  } catch (err) {
    console.log('error while importing ecar', err);
    process.send({message: "IMPORT_ERROR", err})
  }
}
const extractEcar = async (contentImportData: IContentImport) => {
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
        await extractContent(zipHandler, contentBasePath, entry)
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
const extractContent = (zipHandler, dest, entry) => {
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
  if (data.message === ImportSteps.copyEcar) {
    copyEcar(data.contentImportData)
  } else if(data.message === ImportSteps.parseEcar) {
    parseEcar(data.contentImportData)
  } else if (data.message === ImportSteps.extractEcar) {
    extractEcar(data.contentImportData);
  } else if (data.message === "KILL") {
    process.send({message: "DATA_SYNC_KILL", contentImportData: ''})
  }
});
