import * as git from "gitresources";
import * as api from "../../api-core";

export class TestDocumentDeltaConnection implements api.IDocumentDeltaConnection {
    public existing: boolean;
    public parentBranch: string;
    public user: api.IAuthenticatedUser;
    public clientId: string;
    public documentId: string;
    public encrypted: boolean;
    public privateKey: string;
    public publicKey: string;

    public on(event: string, listener: Function): this {
        throw new Error("Method not implemented.");
    }

    public submit(message: api.IDocumentMessage): void {
        throw new Error("Method not implemented.");
    }

    public disconnect() {
        return;
    }
}

export class TestDocumentStorageService implements api.IDocumentStorageService {
    public getSnapshotTree(version: git.ICommit): Promise<api.ISnapshotTree> {
        throw new Error("Method not implemented.");
    }

    public getVersions(sha: string, count: number): Promise<git.ICommit[]> {
        throw new Error("Method not implemented.");
    }

    public read(path: string): Promise<string> {
        throw new Error("Method not implemented.");
    }

    public write(root: api.ITree, message: string): Promise<git.ICommit> {
        throw new Error("Method not implemented.");
    }
}

export class TestDocumentDeltaStorageService implements api.IDocumentDeltaStorageService {
    public get(from?: number, to?: number): Promise<api.ISequencedDocumentMessage[]> {
        throw new Error("Method not implemented.");
    }
}

export class TestDocumentService implements api.IDocumentService {
    public async connectToStorage(id: string, token: string): Promise<api.IDocumentStorageService> {
        return new TestDocumentStorageService();
    }

    public async connectToDeltaStorage(id: string, token: string): Promise<api.IDocumentDeltaStorageService> {
        return new TestDocumentDeltaStorageService();
    }

    public async connectToDeltaStream(id: string, token: string): Promise<api.IDocumentDeltaConnection> {
        return new TestDocumentDeltaConnection();
    }

    public branch(id: string, token: string): Promise<string> {
        return Promise.reject("Not implemented");
    }

    public errorTrackingEnabled() {
        return false;
    }
}
