import config from './config';
import axios from 'axios';
import * as fse from 'fs-extra';
import * as path from 'path';

const files_path = path.join(__dirname, '..', '..', 'data');
const baseUrl = config.baseUrl

let init = async () => {
    await fse.ensureDir(files_path)
    await getResourceBundles()
    //await getOrgs()
    //await getChannel()
    //await frameworks()
    // await getForms()
    //await getPageSections()
}


let getOrgs = async () => {
    for (let id of config.organizations.ids) {
        let result = await axios.post(baseUrl + config.organizations.url,
            { "request": { "filters": { "slug": id, "isRootOrg": true } } })

        await fse.ensureFile(path.join(files_path, config.organizations.dest_folder, id + '.json'))
        await fse.writeJson(path.join(files_path, config.organizations.dest_folder, id + '.json'), result.data)
    }
}

let getChannel = async () => {
    for (let id of config.channels.ids) {
        let result = await axios.get(baseUrl + config.channels.url + id)
        await fse.ensureFile(path.join(files_path, config.channels.dest_folder, id + '.json'))
        await fse.writeJson(path.join(files_path, config.channels.dest_folder, id + '.json'), result.data)
    }
}

const getResourceBundles = async () => {
    for (let bundle of config.resourceBundles.files) {
        let result = await axios.get(baseUrl + config.resourceBundles.url + bundle)

        await fse.ensureFile(path.join(files_path, config.resourceBundles.dest_folder, bundle + '.json'))
        await fse.writeJson(path.join(files_path, config.resourceBundles.dest_folder, bundle + '.json'), result.data)
    }
}

let frameworks = async () => {
    for (let id of config.frameworks.ids) {
        let result = await axios.get(baseUrl + config.frameworks.url + id)
        await fse.ensureFile(path.join(files_path, config.frameworks.dest_folder, id + '.json'))
        await fse.writeJson(path.join(files_path, config.frameworks.dest_folder, id + '.json'), result.data)
    }
}

let getForms = async () => {
    for (let data of config.forms.requests_data) {
        let requestData = {
            request: data
        }
        let result = await axios.post(baseUrl + config.forms.url,
            requestData)
        let filename = `${data.type}_${data.subType}_${data.action}_${data.rootOrgId}`;
        await fse.ensureFile(path.join(files_path, config.forms.dest_folder, filename + '.json'))
        await fse.writeJson(path.join(files_path, config.forms.dest_folder, filename + '.json'), result.data)
    }
}


let getPageSections = async () => {
    for (let data of config.pages.requests_data) {
        let requestData = {
            request: data
        }
        let result = await axios.post(baseUrl + config.pages.url,
            requestData)
        result.data.result.response.sections.forEach(s => {
            s.count = 0;
            s.contents = null;
        });
        let filename = `${data.source}_${data.name}`;
        await fse.ensureFile(path.join(files_path, config.pages.dest_folder, filename + '.json'))
        await fse.writeJson(path.join(files_path, config.pages.dest_folder, filename + '.json'), result.data)
    }
}

init()
    .catch(err => {
        console.log('Error while preparing data', err);
    })