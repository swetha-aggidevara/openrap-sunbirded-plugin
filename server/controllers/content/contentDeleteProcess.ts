
import { logger } from "@project-sunbird/ext-framework-server/logger";
import * as _ from "lodash";
import { containerAPI } from "OpenRAP/dist/api";
import { manifest } from '../../manifest';
import { of } from 'rxjs';
import { mergeMap, retry } from 'rxjs/operators';

process.on("message", (filePaths) => {
    for (const filePath of filePaths) {
        contentDeleteProcess.pushToQueue(filePath);
    }
});

class ContentDeleteProcess {
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
        if (this.checkPath(path)) {
            this.queue.push(path);
            this.next();
        }
    }
    private next() {
        while (this.running < this.concurrency && this.queue.length) {
            const path = this.queue.shift();
            const deleteSub = of(this.fileSDK.remove(path)).pipe(mergeMap((data) => {
                return of (data);
            }),
            retry(5),
            );
            const deleteSubscription = deleteSub.subscribe({
                    next: (val) => {
                        this.running--;
                        this.next();
                    },
                    error: (err) => {
                        logger.error(`error while deleting the content ${err.stack} and retried for 5 times`);
                        this.running--;
                        this.next();
                    },
                  });
            this.running++;
        }
        if (this.queue.length === 0) {
            process.send({processed: true});
        }
    }
    private checkPath(path) {
        const regex = /content\/\w*/;
        return path.match(regex) && !_.includes(this.queue, path);
    }
  }
const contentDeleteProcess =  new ContentDeleteProcess(5);
