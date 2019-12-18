import * as  _ from "lodash";
import * as fs from "fs";
import * as path from "path";
import * as fse from "fs-extra";
import { manifest } from "../../manifest";
import * as uuid from "uuid";
import { containerAPI } from "OpenRAP/dist/api";
import { logger } from "@project-sunbird/ext-framework-server/logger";
const fileSDK = containerAPI.getFileSDKInstance(manifest.id);

export class ExportContent {
  private contentBaseFolder = fileSDK.getAbsPath("content");
  private parentArchive;
  private parentManifest;
  private ecarName;
  private corruptContents = [];
  private startTime = Date.now();
  private cb;
  private parentDetails;
  constructor(private destFolder, private dbParentDetails, private dbChildNodes) { }
  public async export(cb) {
    this.cb = cb;
    try {
      this.parentArchive = fileSDK.archiver();
      this.parentManifest = await fileSDK.readJSON(path.join(this.contentBaseFolder, this.dbParentDetails.identifier, "manifest.json"));
      this.parentDetails = _.get(this.parentManifest, "archive.items[0]");
      this.ecarName = this.parentDetails.name ? this.parentDetails.name.replace(/[&\/\\#,+()$~%.!@%|"":*?<>{}]/g, "") : "Untitled content";
      logger.info("Export content mimeType", this.parentDetails.mimeType);
      if (this.parentDetails.mimeType === "application/vnd.ekstep.content-collection") {
        await this.loadParentCollection();
      } else {
        await this.loadContent(this.parentDetails, false);
      }
      // this.interval = setInterval(() => logger.log(this.parentArchive.pointer(),
      // this.parentArchive._entriesCount, this.parentArchive._entriesProcessedCount), 1000);
      const data = await this.streamZip();
      logger.info("Ecar exported successfully with", data);
      this.cb(null, data);
    } catch (error) {
      this.cb(error, null);
      logger.error("Got Error while exporting content", this.ecarName, error);
    }
  }
  private async loadParentCollection() {
    if (this.parentDetails.appIcon) {
      const appIconFileName = path.basename(this.parentDetails.appIcon);
      const appIcon = path.join(this.contentBaseFolder, this.parentDetails.identifier, appIconFileName);
      if (path.dirname(this.parentDetails.appIcon) !== ".") {
        this.archiveAppend("createDir", null, path.dirname(this.parentDetails.appIcon));
      }
      this.archiveAppend("path", appIcon, this.parentDetails.appIcon);
    }
    this.archiveAppend("path", path.join(this.contentBaseFolder, this.parentDetails.identifier, "manifest.json"), "manifest.json");
    const exist = await fse.pathExists(path.join(this.contentBaseFolder,
      this.parentDetails.identifier, "hierarchy.json"));
    if (exist) {
      this.archiveAppend("path", path.join(this.contentBaseFolder, this.parentDetails.identifier, "hierarchy.json"), "hierarchy.json");
    }
    await this.loadChildNodes();
  }
  private async loadChildNodes() {
    if (!this.parentDetails.childNodes || !this.parentDetails.childNodes.length) {
      logger.debug("No child node for content to export", this.parentDetails.identifier);
      return;
    }
    const childNodes = _.filter(_.get(this.parentManifest, "archive.items"),
      (item) => (item.mimeType !== "application/vnd.ekstep.content-collection")).map((item) => item.identifier);
    for (const child of childNodes) {
      const dbChildDetails = _.find(this.dbChildNodes, { identifier: child });
      const childManifest = await fileSDK.readJSON(path.join(this.contentBaseFolder, child, "manifest.json"))
        .catch((err) => logger.error(`Error while reading content: ${child} for content import for ${this.parentDetails.identifier}`));
      if (childManifest) {
        const childDetails = _.get(childManifest, "archive.items[0]");
        await this.loadContent(childDetails, true);
      } else if (dbChildDetails) {
        await this.loadContent(dbChildDetails, true, true);
      } else {
        this.corruptContents.push({ id: child, reason: "CONTENT_MISSING" });
      }
    }
  }
  private async loadContent(contentDetails, child, manifestMissing = false) {
    const contentState = await this.validContent(contentDetails);
    if (!contentState.valid) {
      this.corruptContents.push({ id: contentDetails.identifier, reason: contentState.reason });
      return;
    }
    const baseDestPath = child ? contentDetails.identifier + "/" : "";
    if (child) {
      this.archiveAppend("createDir", null, contentDetails.identifier);
    }
    if (manifestMissing) {
      this.archiveAppend("buffer", this.getManifestBuffer(contentDetails), baseDestPath + "manifest.json");
    } else {
      this.archiveAppend("path", path.join(this.contentBaseFolder, contentDetails.identifier, "manifest.json"),
        baseDestPath + "manifest.json");
    }
    if (contentDetails.appIcon) {
      if (path.dirname(contentDetails.appIcon) !== ".") {
        this.archiveAppend("createDir", null, baseDestPath + path.dirname(contentDetails.appIcon));
      }
      const appIconFileName = path.basename(contentDetails.appIcon);
      const appIcon = path.join(this.contentBaseFolder, contentDetails.identifier, appIconFileName);
      this.archiveAppend("path", appIcon, baseDestPath + contentDetails.appIcon);
    }
    if (contentDetails.artifactUrl && path.extname(contentDetails.artifactUrl)) {
      this.archiveAppend("createDir", null, baseDestPath + path.dirname(contentDetails.artifactUrl));
      this.parentArchive.append(null, { name: baseDestPath + path.dirname(contentDetails.artifactUrl) + "/" });
    }
    if (contentDetails.artifactUrl
      && path.extname(contentDetails.artifactUrl) && path.extname(contentDetails.artifactUrl) !== ".zip") {
      const artifactUrlName = path.basename(contentDetails.artifactUrl);
      const artifactUrlPath = path.join(this.contentBaseFolder, contentDetails.identifier, artifactUrlName);
      this.archiveAppend("path", artifactUrlPath, baseDestPath + contentDetails.artifactUrl);
    } else if (contentDetails.artifactUrl
      && path.extname(contentDetails.artifactUrl) && path.extname(contentDetails.artifactUrl) === ".zip") {
      await this.loadZipContent(contentDetails, child);
    }
  }
  private async validContent(contentDetails) {
    const exist = await fse.pathExists(path.join(this.contentBaseFolder, contentDetails.identifier));
    if (!exist) {
      return { valid: false, reason: "CONTENT_FOLDER_MISSING" };
    }
    if (contentDetails.appIcon) {
      const appIconFileName = path.basename(contentDetails.appIcon);
      const appIcon = path.join(this.contentBaseFolder, contentDetails.identifier, appIconFileName);
      const appIconExist = await fse.pathExists(appIcon);
      if (!appIconExist) {
        return { valid: false, reason: "APP_ICON_MISSING" };
      }
    }
    if (contentDetails.artifactUrl && path.extname(contentDetails.artifactUrl)
      && path.extname(contentDetails.artifactUrl) !== ".zip") {
      const artifactUrlName = path.basename(contentDetails.artifactUrl);
      const artifactUrlPath = path.join(this.contentBaseFolder, contentDetails.identifier, artifactUrlName);
      const artifactExist = await fse.pathExists(artifactUrlPath);
      if (!artifactExist) {
        return { valid: false, reason: "ARTIFACT_URL_MISSING" };
      }
    }
    return { valid: true };
  }
  private async loadZipContent(contentDetails, child) {
    const baseDestPath = child ? contentDetails.identifier + "/" : "";
    const childArchive = fileSDK.archiver();
    const toBeZipped: any = await this.readDirectory(path.join(this.contentBaseFolder, contentDetails.identifier));
    for (const items of toBeZipped) {
      if ((!contentDetails.appIcon || !contentDetails.appIcon.includes(items)) && items !== "manifest.json") {
        if (path.extname(items)) {
          childArchive.append(fs.createReadStream(path.join(this.contentBaseFolder,
            contentDetails.identifier, items)), { name: items });
        } else {
          childArchive.directory(path.join(this.contentBaseFolder, contentDetails.identifier, items), items);
        }
      }
    }
    childArchive.finalize();
    this.archiveAppend("stream", childArchive, baseDestPath + contentDetails.artifactUrl);
  }
  private async streamZip() {
    return new Promise((resolve, reject) => {
      const ecarFilePath = path.join(this.destFolder, this.ecarName + ".ecar");
      const output = fs.createWriteStream(ecarFilePath);
      output.on("close", () => resolve({
        ecarSize: this.parentArchive.pointer(),
        timeTaken: (Date.now() - this.startTime) / 1000,
        skippedContent: this.corruptContents,
        name: this.ecarName,
        ecarFilePath,
      }));
      output.on("end", () => logger.log("Content has been zipped"));
      this.parentArchive.on("error", reject);
      this.parentArchive.finalize();
      this.parentArchive.pipe(output);
    });
  }
  private archiveAppend(type, src, dest) {
    logger.info(`Adding ${src} of type ${type} to dest folder ${dest}`);
    if (type === "path") {
      this.parentArchive.append(fs.createReadStream(src), { name: dest });
    } else if (type === "directory") {
      this.parentArchive.directory(src, dest);
    } else if (type === "stream") {
      this.parentArchive.append(src, { name: dest });
    } else if (type === "createDir") {
      dest = dest.endsWith("/") ? dest : dest + "/";
      this.parentArchive.append(null, { name: dest });
    } else if (type === "buffer") {
      this.parentArchive.append(src, { name: dest });
    }
  }
  private async readDirectory(filePath) {
    return new Promise((resolve, reject) =>
      fs.readdir(filePath, (err, items) => err ? reject(err) : resolve(items)));
  }
  private getManifestBuffer(manifestJson) {
    const manifestData = {
      id: "ekstep.content.archive",
      ver: manifestJson.pkgVersion || "1.0",
      ts: new Date(),
      params: { resmsgid: uuid() },
      archive: {
        count: 1,
        ttl: 24,
        items: [manifestJson],
      },
    };
    return Buffer.from(JSON.stringify(manifestData));
  }
}
