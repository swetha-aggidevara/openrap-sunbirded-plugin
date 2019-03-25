/**
 * @author Harish Kumar Gangula <harishg@ilimi.in>
 */
import * as fse from 'fs-extra';
import * as path from 'path';
import * as unzipper from 'unzipper';

/**
 * This SDK provides methods to handle file deleting , folder creation and deletion prefixed with pluginId
 * 
 */

export default class FileSDK {

    private pluginId: string;
    private prefixPath: string;

    initialize(pluginId: string): void {
        this.pluginId = pluginId;
        this.prefixPath = path.join(__dirname, '..', '..', '..', this.pluginId);
    }

    /**
     * 
     * @param filePath 
     * This method deletes the file it adds the plugin id as prefix so that conflicts with file path 
     * with other plugins are resolved it tries to find file from current directory to delete it
     * @returns Promise
     */
    deleteFile(filePath) {
        return fse.remove(path.join(this.prefixPath, filePath));
    }


    /**
     * @param folderPath 
     * This method deletes the folder it adds the plugin id as prefix so that conflicts with folder path 
     * with other plugins are resolved it tries to find folder from current directory to delete it
     * @returns Promise
     */
    deleteFolder(folderPath: string) {
        return fse.remove(path.join(this.prefixPath, folderPath));
    }

    /**
     * @param foldersPath 
     * This method creates the folders it adds the plugin id as prefix so that conflicts with folder path 
     * with other plugins are resolved it tries to find folder  from current directory
     * @returns Promise
     */
    createFolder(foldersPath: string[] | string) {
        if (typeof foldersPath === 'string') {
            return fse.ensureDir(path.join(this.prefixPath, foldersPath))
        }
        let promises = [];
        foldersPath.forEach((folder) => {
            promises.push(fse.ensureDir(path.join(this.prefixPath, folder)))
        })
        return Promise.all(promises);
    }

    /**
     * @param filePath
     * @param  destPath
     *  @param extractToFolder // If this flag is true contents will be extracted to folder 
     * which is create using source file name, 
     * if it is false it is extracted to dest folder with out creating folder with file name
     * 
     * This method will unzip the file to dest folder 
     * @returns Promise
     */
    unzipFile(filePath: string, destPath: string, extractToFolder: boolean) {
        //This is folder name taken from source filename and contents will be extracted to this folder name
        let destFolderName = destPath;
        if (extractToFolder) {
            destFolderName = path.join(destPath, path.basename(filePath, path.extname(filePath)))
        }

        return new Promise((resolve, reject) => {
            fse.createReadStream(filePath).pipe(unzipper.Extract({ path: destFolderName }))
                .on('error', (err) => {
                    reject(err.message)
                })
                .on('close', () => {
                    resolve(path.join(destPath, destFolderName))
                })
        })
    }

    copyFile(sourcePath: string, destPath: string) {

        let isAbsoluteSourcePath = path.isAbsolute(sourcePath)
        if (!isAbsoluteSourcePath) {
            sourcePath = this.geAbsolutePath(sourcePath)
        }
        // below code to get the zip file name to extract into it
        // let destFolder = path.basename(sourcePath, path.extname(sourcePath));

        let isAbsoluteDestPath = path.isAbsolute(destPath)
        if (!isAbsoluteDestPath) {
            destPath = this.geAbsolutePath(destPath)
        }

        return fse.copy(sourcePath, destPath)
    }

    deleteDir(dirPath: string) {
        return fse.emptyDir(dirPath)

    }

    readJSON(filePath: string) {
        return fse.readJson(filePath);
    }

    geAbsolutePath(file_path) {
        return path.join(this.prefixPath, file_path);
    }
}