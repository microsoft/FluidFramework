import * as resources from "@prague/gitresources";
import {
    IDeltaStorageService,
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentService,
    IDocumentStorageService,
    ISnapshotTree,
    ITokenProvider,
    ITree,
} from "@prague/runtime-definitions";
import * as socketStorage from "@prague/socket-storage";
import { TestDocumentDeltaConnection } from "./";

class TestDocumentStorageService implements IDocumentStorageService {
    public async getSnapshotTree(version: resources.ICommit): Promise<ISnapshotTree> {
        return null;
    }

    public async getVersions(sha: string, count: number): Promise<resources.ICommit[]> {
        return [];
    }

    public async read(path: string): Promise<string> {
        return "";
    }

    public async getContent(version: resources.ICommit, path: string): Promise<string> {
        return "";
    }

    public async write(root: ITree, parents: string[], message: string): Promise<resources.ICommit> {
        const commit: resources.ICommit = {
            author: { date: "", email: "", name: ""},
            committer: { date: "", email: "", name: ""},
            message: "",
            parents: [],
            sha: "test",
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

    public async getBlob(sha: string): Promise<resources.IBlob> {
        return null;
    }

    public getRawUrl(sha: string): string {
        return null;
    }
}

export class TestDocumentService implements IDocumentService {
    private errorTracking = new socketStorage.DefaultErrorTracking();

    constructor(private deltaStorage: IDeltaStorageService) {
    }

    public async connectToStorage(
        tenantId: string,
        id: string,
        tokenProvider: ITokenProvider): Promise<IDocumentStorageService> {
        return new TestDocumentStorageService();
    }

    public async connectToDeltaStorage(
        tenantId: string,
        id: string,
        tokenProvider: ITokenProvider): Promise<IDocumentDeltaStorageService> {
        return new socketStorage.DocumentDeltaStorageService(tenantId, id, tokenProvider, this.deltaStorage);
    }

    public async connectToDeltaStream(
        tenantId: string,
        id: string,
        tokenProvider: ITokenProvider): Promise<IDocumentDeltaConnection> {

        return new TestDocumentDeltaConnection(id, "test-client", false, "", null, undefined, undefined);
    }

    public branch(tenantId: string, id: string, tokenProvider: ITokenProvider): Promise<string> {
        return Promise.reject("Not implemented");
    }

    public getErrorTrackingService() {
        return this.errorTracking;
    }
}
