import * as resources from "gitresources";
import * as api from "../../api-core";
import { DocumentDeltaStorageService } from "../../socket-storage";
import { TestDocumentDeltaConnection } from "./";

class TestDocumentStorageService implements api.IDocumentStorageService {
    public async getSnapshotTree(version: resources.ICommit): Promise<api.ISnapshotTree> {
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

    public async write(root: api.ITree, parents: string[], message: string): Promise<resources.ICommit> {
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

export class TestDocumentService implements api.IDocumentService {

    constructor(private deltaStorage: api.IDeltaStorageService) {
    }

    public async connectToStorage(tenantId: string, id: string, token: string): Promise<api.IDocumentStorageService> {
        return new TestDocumentStorageService();
    }

    public async connectToDeltaStorage(
        tenantId: string,
        id: string,
        token: string): Promise<api.IDocumentDeltaStorageService> {
        return new DocumentDeltaStorageService(tenantId, id, token, this.deltaStorage);
    }

    public async connectToDeltaStream(
        tenantId: string,
        id: string,
        token: string): Promise<api.IDocumentDeltaConnection> {

        return new TestDocumentDeltaConnection(id, "test-client", false, "", null, undefined);
    }

    public branch(tenantId: string, id: string, token: string): Promise<string> {
        return Promise.reject("Not implemented");
    }

    public errorTrackingEnabled() {
        return false;
    }
}
