import * as api from "@prague/container-definitions";
import * as resources from "@prague/gitresources";

/**
 * Document storage service for the test driver...just does a default implememtation for
 * all the methods
 */
export class TestDocumentStorageService implements api.IDocumentStorageService  {
    public get repositoryUrl(): string {
        return "";
    }

    public getSnapshotTree(version?: resources.ICommit): Promise<api.ISnapshotTree> {
        return null;
    }

    public async getVersions(commitId: string, count: number): Promise<resources.ICommit[]> {
       return [];
    }

    public async read(id: string): Promise<string> {
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

    public getRawUrl(blobId: string): string {
        return null;
    }
}
