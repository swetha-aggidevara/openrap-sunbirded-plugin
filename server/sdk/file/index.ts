/**
 * @author Harish Kumar Gangula <harishg@ilimi.in>
 */
import * as fs from 'fs-extra';
import * as path from 'path';
import * as zlib from 'zlib';

/**
 * This SDK provides methods to handle file deleting , folder creation and deletion prefixed with pluginId
 * 
 */

export default class FileSDK {

    private pluginId: string;

    initialize(pluginId: string): void {
        this.pluginId = pluginId;
    }

    /**
     * 
     * @param file_path 
     * This method deletes the file it adds the plugin id as prefix so that conflicts with file path 
     * with other plugins are resolved it tries to find file from current directory to delete it
     * @returns Promise
     */
    deleteFile(file_path) {
        return fs.remove(path.join(__dirname, this.pluginId, file_path));
    }


    /**
     * @param folder_path 
     * This method deletes the folder it adds the plugin id as prefix so that conflicts with folder path 
     * with other plugins are resolved it tries to find folder from current directory to delete it
     * @returns Promise
     */
    deleteFolder(folder_path: string) {
        return fs.remove(path.join(__dirname, this.pluginId, folder_path));
    }

    /**
     * @param folders_path 
     * This method creates the folders it adds the plugin id as prefix so that conflicts with folder path 
     * with other plugins are resolved it tries to find folder  from current directory
     * @returns Promise
     */
    createFolder(folders_path: string[] | string) {
        if (typeof folders_path === 'string') {
            return fs.ensureDir(path.join(__dirname, this.pluginId, folders_path))
        }
        let promises = [];
        folders_path.forEach((folder) => {
            promises.push(fs.ensureDir(path.join(__dirname, this.pluginId, folder)))
        })
        return Promise.all(promises);
    }

    /**
     * @param file_path
     * @param  dest_path
     * This method will unzip the file to dest folder 
     * @returns Promise
     */
    unzipFile(file_path: string, dest_path: string) {
        return new Promise((resolve, reject) => {
            const fileContents = fs.createReadStream(path.join(__dirname, file_path));
            const writeStream = fs.createWriteStream(path.join(__dirname, dest_path));
            const unzip = zlib.createGunzip();
            fileContents.pipe(unzip).pipe(writeStream).on('finish', (err) => {
                if (err) return reject(err);
                else resolve();
            })
        })
    }
}