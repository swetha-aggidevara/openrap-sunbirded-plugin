import { containerAPI } from 'OpenRAP/dist/api';
import * as path from 'path';
async function unzip(filePath, destPath, extractToFolder, pluginId){
  const fileSDK = containerAPI.getFileSDKInstance(pluginId);
  await fileSDK.unzip(filePath, destPath, extractToFolder)
}

process.on('message', async ({ message, filePath, destPath, extractToFolder, pluginId, ...data}) => {
  if(message === 'UNZIP'){
    await unzip(filePath, destPath, extractToFolder, pluginId).then( res => {
      console.log('------------------child process UNZIP succuss---------------------');
      process.send({data});
    }).catch(error => {
      console.log('------------------child process UNZIP error---------------------');
      process.send({error, data});
    })
  }
})