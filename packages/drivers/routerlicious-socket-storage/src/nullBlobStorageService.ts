import * as api from "@prague/container-definitions";
import * as resources from "@prague/gitresources";

/**
 * Document access to underlying storage
 */
export class NullBlobtorageService implements api.IDocumentStorageService  {
    public get repositoryUrl(): string {
        return "";
    }

    public async getSnapshotTree(version?: resources.ICommit): Promise<api.ISnapshotTree | null | undefined> {
        return null;
    }

    public async getVersions(commitId: string, count: number): Promise<resources.ICommit[]> {
        return [];
    }

    public async read(blobId: string): Promise<string | undefined> {
        return;
    }

    public async getContent(version: resources.ICommit, path: string): Promise<string | undefined> {
        return;
    }

    public write(tree: api.ITree, parents: string[], message: string, ref: string): Promise<resources.ICommit> {
        return Promise.reject("Null blob storage can not write commit");
    }

    public async createBlob(file: Buffer): Promise<resources.ICreateBlobResponse> {
        return Promise.reject("Null blob storage can not create blob");
    }

    public getRawUrl(blobId: string): string | undefined {
        return;
    }
}
