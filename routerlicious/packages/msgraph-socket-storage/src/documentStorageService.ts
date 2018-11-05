import * as resources from "@prague/gitresources";
import * as api from "@prague/runtime-definitions";

/**
 * Document storage service for sharepoint...For now, this is just a placeholder
 * It just does a default implememtation for all the methods
 */
export class DocumentStorageService implements api.IDocumentStorageService  {

    public getSnapshotTree(version: resources.ICommit): Promise<api.ISnapshotTree> {
        return null;
    }

    public async getVersions(sha: string, count: number): Promise<resources.ICommit[]> {
       return [];
    }

    public async read(sha: string): Promise<string> {
        return "";
    }

    public async getContent(version: resources.ICommit, path: string): Promise<string> {
        return "";
    }

    public write(tree: api.ITree, parents: string[], message: string): Promise<resources.ICommit> {
        return null;
    }

    public async createBlob(file: Buffer): Promise<resources.ICreateBlobResponse> {
        return null;
    }

    public getRawUrl(sha: string): string {
        return null;
    }
}
