export enum ImportSteps {
  copyEcar = "COPY_ECAR",
  parseEcar = "PARSE_ECAR",
  extractEcar = "EXTRACT_ECAR",
  extractArtifact = "EXTRACT_ARTIFACT",
  processContents = "PROCESS_CONTENTS",
  complete = "COMPLETE"
}
export enum ImportProgress {
  "COPY_ECAR" = 1,
  "PARSE_ECAR" = 23,
  "EXTRACT_ECAR" = 25,
  "EXTRACT_ARTIFACT" = 90,
  "PROCESS_CONTENTS" = 98,
  "COMPLETE" = 100
}
export enum ImportStatus {
  reconcile = "RECONCILE",
  inQueue = "IN_QUEUE",
  resume = "RESUME",
  inProgress = "IN_PROGRESS",
  paused = "PAUSED",
  completed = "COMPLETED",
  failed = "FAILED",
  canceled = "CANCELED",
  canceling = "CANCELING",
  pausing = "PAUSING"
}

export interface IContentImport {
  _id: string;
  _rev?: string;
  importStatus: ImportStatus;
  createdOn: string | number;
  ecarSourcePath: string;
  contentId?: string;
  contentType?: string;
  importStep?: ImportSteps;
  ecarEntriesCount?: number; 
  extractedEcarEntriesCount?: Object;
  artifactCount?: number;
  artifactUnzipped?: Object;
  failedReason?: string;
  childNodes?: Array<string>;
  importProgress?: number;
  ecarFileSize?: number;
  ecarFileCopied?: number;
}
export interface IContentManifest {
  archive: {
    items: Array<any>;
  };
}
