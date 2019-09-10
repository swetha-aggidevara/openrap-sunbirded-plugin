import { containerAPI } from 'OpenRAP/dist/api';
import * as path from 'path';
async function unzip(filePath, destPath, extractToFolder, pluginId){
  const fileSDK = containerAPI.getFileSDKInstance(pluginId);
  await fileSDK.unzip(filePath, destPath, extractToFolder)
}

process.on('message', async ({ message, filePath, destPath, extractToFolder, pluginId}) => {
  if(message === 'UNZIP'){
    await unzip(filePath, destPath, extractToFolder, pluginId).then(res => {
      console.log('child process unzipping content in : ', filePath, ' succuss');
      process.send({data: {filePath, destPath}});
    }).catch(error => {
      console.log('child process unzipping content in : ', filePath, ' failed');
      process.send({error, data: {filePath, destPath}});
    })
  }
})