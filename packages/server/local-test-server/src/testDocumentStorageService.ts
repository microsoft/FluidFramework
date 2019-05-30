import * as api from "@prague/container-definitions";

/**
 * Document storage service for the test driver...just does a default implementation for
 * all the methods
 */
export class TestDocumentStorageService implements api.IDocumentStorageService  {
    public get repositoryUrl(): string {
        return "";
    }

    public getSnapshotTree(version?: api.IVersion): Promise<api.ISnapshotTree> {
        return null;
    }

    public async getVersions(commitId: string, count: number): Promise<api.IVersion[]> {
       return [];
    }

    public async read(id: string): Promise<string> {
        return "";
    }

    public async getContent(version: api.IVersion, path: string): Promise<string> {
        return "";
    }

    public write(tree: api.ITree, parents: string[], message: string): Promise<api.IVersion> {
        return null;
    }

    public uploadSummary(commit: api.ISummaryCommit): Promise<api.ISummaryPackfileHandle> {
        return Promise.reject("Not implemented");
    }

    public downloadSummary(handle: api.ISummaryPackfileHandle): Promise<api.ISummaryCommit> {
        return Promise.reject("Invalid operation");
    }

    public async createBlob(file: Buffer): Promise<api.ICreateBlobResponse> {
        return null;
    }

    public getRawUrl(blobId: string): string {
        return null;
    }
}
