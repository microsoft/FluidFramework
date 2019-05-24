import * as api from "@prague/container-definitions";

/**
 * Document access to underlying storage
 */
export class NullBlobStorageService implements api.IDocumentStorageService  {
    public get repositoryUrl(): string {
        return "";
    }

    public async getSnapshotTree(version?: api.IVersion): Promise<api.ISnapshotTree | null | undefined> {
        return null;
    }

    public async getVersions(commitId: string, count: number): Promise<api.IVersion[]> {
        return [];
    }

    public async read(blobId: string): Promise<string | undefined> {
        return;
    }

    public async getContent(version: api.IVersion, path: string): Promise<string | undefined> {
        return;
    }

    public write(tree: api.ITree, parents: string[], message: string, ref: string): Promise<api.IVersion> {
        return Promise.reject("Null blob storage can not write commit");
    }

    public async createBlob(file: Buffer): Promise<api.ICreateBlobResponse> {
        return Promise.reject("Null blob storage can not create blob");
    }

    public getRawUrl(blobId: string): string | undefined {
        return;
    }
}
