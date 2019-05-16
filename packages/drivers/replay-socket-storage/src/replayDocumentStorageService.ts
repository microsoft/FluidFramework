import * as api from "@prague/container-definitions";
import * as resources from "@prague/gitresources";

/**
 * Document storage service for the replay driver...just does a default implementation for
 * all the methods
 */
export class ReplayDocumentStorageService implements api.IDocumentStorageService  {
    public get repositoryUrl(): string {
        return "";
    }

    public async getSnapshotTree(version?: resources.ICommit): Promise<api.ISnapshotTree | null> {
        return null;
    }

    public async getVersions(commitId: string, count: number): Promise<resources.ICommit[]> {
       return [];
    }

    public async read(blobId: string): Promise<string> {
        return "";
    }

    public async getContent(version: resources.ICommit, path: string): Promise<string> {
        return "";
    }

    public async write(tree: api.ITree, parents: string[], message: string): Promise<resources.ICommit | null> {
        return null;
    }

    public async createBlob(file: Buffer): Promise<resources.ICreateBlobResponse | null> {
        return null;
    }

    public getRawUrl(blobId: string): string | null {
        return null;
    }
}
