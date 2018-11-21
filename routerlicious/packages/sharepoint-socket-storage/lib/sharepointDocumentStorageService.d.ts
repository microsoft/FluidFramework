/// <reference types="node" />
import * as resources from "@prague/gitresources";
import * as api from "@prague/runtime-definitions";
/**
 * Document storage service for sharepoint...For now, this is just a placeholder
 * It just does a default implememtation for all the methods
 */
export declare class ReplayDocumentStorageService implements api.IDocumentStorageService {
    getSnapshotTree(version: resources.ICommit): Promise<api.ISnapshotTree>;
    getVersions(sha: string, count: number): Promise<resources.ICommit[]>;
    read(sha: string): Promise<string>;
    getContent(version: resources.ICommit, path: string): Promise<string>;
    write(tree: api.ITree, parents: string[], message: string): Promise<resources.ICommit>;
    createBlob(file: Buffer): Promise<resources.ICreateBlobResponse>;
    getRawUrl(sha: string): string;
}
