import * as api from "@prague/container-definitions";

/**
 * Document storage service for the replay driver...just does a default implementation for
 * all the methods
 */
export class ReplayDocumentStorageService implements api.IDocumentStorageService  {
    public get repositoryUrl(): string {
        throw new Error("Invalid operation");
    }

    public async getSnapshotTree(version?: api.IVersion): Promise<api.ISnapshotTree | null> {
        return null;
    }

    public async getVersions(versionId: string, count: number): Promise<api.IVersion[]> {
       return [];
    }

    public async read(blobId: string): Promise<string | undefined> {
        return Promise.reject("Invalid operation");
    }

    public uploadSummary(commit: api.ISummaryCommit): Promise<api.ISummaryPackfileHandle> {
        return Promise.reject("Invalid operation");
    }

    public async getContent(version: api.IVersion, path: string): Promise<string> {
        return "";
    }

    public async write(tree: api.ITree, parents: string[], message: string): Promise<api.IVersion | null> {
        return null;
    }

    public async createBlob(file: Buffer): Promise<api.ICreateBlobResponse> {
        return Promise.reject(new Error("ReplayDocumentStorageService.createBlob() not implemented"));
    }

    public downloadSummary(handle: api.ISummaryPackfileHandle): Promise<api.ISummaryCommit> {
        return Promise.reject("Invalid operation");
    }

    public getRawUrl(blobId: string): string | undefined {
        throw new Error("Invalid operation");
    }
}
