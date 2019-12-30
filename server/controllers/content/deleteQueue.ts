import { logger } from "@project-sunbird/ext-framework-server/logger";
import * as _ from "lodash";
import { containerAPI } from "OpenRAP/dist/api";
import { manifest } from '../../manifest';

export class DeleteQueue {
    private concurrency: number;
    private queue: string[];
    private running: number;
    private fileSDK: any;
    constructor(concurrency) {
        this.fileSDK = containerAPI.getFileSDKInstance(manifest.id);
        this.concurrency = concurrency;
        this.queue = [];
        this.running = 0;
    }
    public pushToQueue(path) {
        if (!_.includes(this.queue, path) && this.checkPath(path)) {
            this.queue.push(path);
            this.next();
        }
    }
    private next() {
        while (this.running < this.concurrency && this.queue.length) {
            const path = this.queue.shift();
            this.fileSDK.remove(path).then(() => {
                this.running--;
                this.next();
            }).catch((err: { stack: any; }) => {
              logger.error(`error while deleting the content ${err.stack}`);
              this.running--;
              this.next();
            });
            this.running++;
        }
    }
    private checkPath(path) {
        return _.includes(path, "content/do_");
    }
  }
