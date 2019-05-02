import {
    IDeltaStorageService,
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentStorageService,
    ISnapshotTree,
    ITokenProvider,
    ITree,
} from "@prague/container-definitions";
import * as resources from "@prague/gitresources";
import * as socketStorage from "@prague/routerlicious-socket-storage";
import { TestDocumentDeltaConnection } from "./";

class TestDocumentStorageService implements IDocumentStorageService {
    public get repositoryUrl(): string {
        return "";
    }

    public async getSnapshotTree(version?: resources.ICommit): Promise<ISnapshotTree> {
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

    public async write(root: ITree, parents: string[], message: string): Promise<resources.ICommit> {
        const commit: resources.ICommit = {
            author: { date: "", email: "", name: ""},
            commitId: "test",
            committer: { date: "", email: "", name: ""},
            message: "",
            parents: [],
            tree: {
                sha: "test",
                url: "test",
            },
            url: "test",
        };
        return commit;
    }

    public async createBlob(file: Buffer): Promise<resources.ICreateBlobResponse> {
        return null;
    }

    public async getBlob(blobId: string): Promise<resources.IBlob> {
        return null;
    }

    public getRawUrl(blobId: string): string {
        return null;
    }
}

export class TestDocumentService implements IDocumentService {
    private errorTracking = new socketStorage.DefaultErrorTracking();

    constructor(
        private deltaStorage: IDeltaStorageService,
        private tokenProvider: ITokenProvider,
        private tenantId: string,
        private documentId: string) {
    }

    public async connectToStorage(): Promise<IDocumentStorageService> {
        return new TestDocumentStorageService();
    }

    public async connectToDeltaStorage(): Promise<IDocumentDeltaStorageService> {
        return new socketStorage.DocumentDeltaStorageService(
            this.tenantId,
            this.documentId,
            this.tokenProvider,
            this.deltaStorage);
    }

    public async connectToDeltaStream(): Promise<IDocumentDeltaConnection> {

        return new TestDocumentDeltaConnection(
            this.documentId,
            "test-client",
            false,
            "",
            undefined,
            undefined,
            undefined);
    }

    public branch(): Promise<string> {
        return Promise.reject("Not implemented");
    }

    public getErrorTrackingService() {
        return this.errorTracking;
    }
}
