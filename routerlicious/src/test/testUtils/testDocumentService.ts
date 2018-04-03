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

    public async write(root: api.ITree, message: string): Promise<resources.ICommit> {
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
}

export class TestDocumentService implements api.IDocumentService {

    constructor(private deltaStorage: api.IDeltaStorageService) {
    }

    public async connectToStorage(id: string, token: string): Promise<api.IDocumentStorageService> {
        return new TestDocumentStorageService();
    }

    public async connectToDeltaStorage(id: string, token: string): Promise<api.IDocumentDeltaStorageService> {
        return new DocumentDeltaStorageService(id, this.deltaStorage);
    }

    public async connectToDeltaStream(id: string, token: string): Promise<api.IDocumentDeltaConnection> {
        return new TestDocumentDeltaConnection(id, "test-client", false, "", null);
    }

    public branch(id: string, token: string): Promise<string> {
        return Promise.reject("Not implemented");
    }
}
