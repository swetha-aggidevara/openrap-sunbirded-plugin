import * as  _ from "lodash";
import { containerAPI } from "OpenRAP/dist/api";
import * as os from "os";
import { manifest } from "../manifest";
const systemSDK = containerAPI.getSystemSDKInstance(manifest.id);

export default class HardDiskInfo {
    public static async getAvailableDiskSpace() {
        const { availableHarddisk, fsSize } = await systemSDK.getHardDiskInfo();
        if (os.platform() === "win32") {
            const fileSize: any = fsSize;
            // tslint:disable-next-line:no-string-literal
            const totalHarddisk = _.find(fileSize, { mount: "C:" })["size"] || 0;
            // tslint:disable-next-line:no-string-literal
            const usedHarddisk = _.find(fileSize, { mount: "C:" })["used"] || 0;
            const availableHardDisk = totalHarddisk - usedHarddisk;
            return availableHardDisk - 300000000; // keeping buffer of 300 mb, this can be configured
        } else {
            return availableHarddisk - 300000000; // keeping buffer of 300 mb, this can be configured
        }
    }
}
