export enum ImportSteps {
  copyEcar = "COPY_ECAR",
  parseEcar = "PARSE_ECAR",
  processManifest = "PROCESS_ECAR",
  extractEcar = "EXTRACT_ECAR",
  processContent = "PROCESS_CONTENT",
  saveContent = "SAVE_CONTENT",
  complete = "COMPLETE"
}

export enum ImportStatus {
  inQueue = "IN_QUEUE",
  resume = "RESUME",
  inProgress = "IN_PROGRESS",
  paused = "PAUSED",
  completed = "COMPLETED",
  failed = "FAILED",
  canceled = "CANCELED",
  reconcile = "RECONCILE"
}

export interface IContentImport {
  id: string;
  importStatus: ImportStatus;
  createdOn: string | number;
  ecarSourcePath: string;
  contentId?: string;
  contentType?: string;
  importStep?: ImportSteps;
  ecarContentEntries?: Object;
  extractedEntries?: Object;
  contentToBeAdded?: Object;
  contentToBeUpdated?: Object;
  failedReason?: string;
  manifest?: object;
  childNodes?: Array<string>;
}
export interface IContentManifest {
  archive: {
    items: Array<any>;
  };
}
