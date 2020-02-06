export interface IDownloadMetadata {
  contentSize: number;
  contentDownloadList: { [Identifier: string]: IContentDownloadList };
  contentId: string;
  mimeType: string;
  contentType: string;
  pkgVersion: number;
}
export interface IContentDownloadList {
    id: string;
    url: string;
    size: number;
    downloaded: boolean;
    extracted: boolean;
    indexed: boolean;
}
