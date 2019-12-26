import * as _ from "lodash";
import { TaskQueue } from "./taskQueue";

process.on("message", (contents) => {
  for (const content of contents) {
    queueExecutor.pushToQueue(content);
  }
});
const queueExecutor = new TaskQueue(1);