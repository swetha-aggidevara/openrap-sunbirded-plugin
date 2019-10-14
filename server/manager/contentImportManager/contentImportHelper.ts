const ecarFileName = "Science - Part 2.ecar";
// const ecarFileName = "10 ಗಣಿತ ಭಾಗ 1.ecar";
const contentFolder = "./content/";
const ecarFolder = "./ecar/";
import * as  StreamZip from 'node-stream-zip';
import * as  fs from 'fs';
import * as  _ from 'lodash';
let ecarEntries = {};

const extractEcar = async (data) => {
  const ecarFileName = data.ecarFileName
  ecarEntries = data.ecarEntries
  if(!ecarFileName.endsWith('.ecar')){
    throw "INVALID_FILE_EXTENSION";
  }
  let zipHandler;
  let contentBasePath = contentFolder + ecarFileName.substr(0, ecarFileName.length - 5)
  let ecarBasePath = ecarFolder + ecarFileName;
  console.log('--------contentBasePath and ecarBasePath-----------', contentBasePath, ecarBasePath);
  console.log('-------------ecarEntries-----------------', ecarEntries);
  try {
    zipHandler = await loadZip(ecarBasePath);
    createDirectory(contentBasePath)
    for (const entry of _.values(zipHandler.entries()) as any) {
      if(!ecarEntries[entry.name]){
        // console.log(`extracting Name: ${entry.name} `) //, contentBasePath,  ecarEntries[entry.name]) //, type: ${desc}, size: ${entry.size}`);
        ecarEntries[entry.name] = true;
        await extractContent(zipHandler, contentBasePath, entry)
      }
    }
    process.send({message: "IMPORT_COMPLETE", ecarEntries})
  } catch (err) {
    console.log('error while importing ecar', err);
    process.send({message: "EXTRACT_ERROR", err})
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
  if (data.message === "IMPORT") {
    console.log(data)
    extractEcar(data);
  } else if (data.message === "KILL") {
    process.send({message: "DATA_SYNC_KILL", ecarEntries})
  }
});
