import * as _ from "lodash";
import { DeleteQueue } from "./deleteQueue";
import { IDeletePath } from './IContent';

process.on("message", (contents: IDeletePath[]) => {
  for (const content of contents) {
    queueExecutor.pushToQueue(content.path);
  }
});
const queueExecutor = new DeleteQueue(1);