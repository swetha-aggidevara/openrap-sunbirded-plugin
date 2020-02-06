export interface IDownloadMetadata {
  contentSize: number;
  downloadedSize: number;
  contentToBeDownloadedCount: number;
  contentDownloadedCount: number;
  contentDownloadedFailedCount: number;
  contentDownloadList: { [Identifier: string]: IContentDownloadList };
  contentId: string;
  mimeType: string;
  contentType: string;
  pkgVersion: number;
}
export interface IContentDownloadList {
  identifier: string;
  url: string;
  size: number;
  downloaded: boolean;
  extracted: boolean;
  indexed: boolean;
}
