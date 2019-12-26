import { logger } from "@project-sunbird/ext-framework-server/logger";
import * as _ from "lodash";
import { containerAPI } from "OpenRAP/dist/api";
import * as path from "path";
import { manifest } from './../../manifest';

export class TaskQueue {
    private concurrency: any;
    private queue: any[];
    private running: number;
    private fileSDK: any;
    constructor(concurrency) {
        this.fileSDK = containerAPI.getFileSDKInstance(manifest.id);
        this.concurrency = concurrency;
        this.queue = [];
        this.running = 0;
    }
    public pushToQueue(id) {
        if (!_.includes(this.queue, id)) {
          this.queue.push(id);
          this.next();
        }
    }
    private next() {
        while (this.running < this.concurrency && this.queue.length) {
            const id = this.queue.shift();
            this.fileSDK.remove(path.join("content", id)).then(() => {
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
  }