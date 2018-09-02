// tslint:disable:ban-types
import { core as api, socketStorage } from "@prague/client-api";
import * as git from "@prague/gitresources";

export class TestDocumentDeltaConnection implements api.IDocumentDeltaConnection {
    public existing: boolean;
    public parentBranch: string;
    public user: api.ITenantUser;
    public clientId: string;
    public initialMessages: api.ISequencedDocumentMessage[] | undefined;
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

    public async getContent(version: git.ICommit, path: string): Promise<string> {
        return "";
    }

    public read(path: string): Promise<string> {
        throw new Error("Method not implemented.");
    }

    public write(root: api.ITree, parents: string[], message: string): Promise<git.ICommit> {
        throw new Error("Method not implemented.");
    }

    public async createBlob(file: Buffer): Promise<git.ICreateBlobResponse> {
        return null;
    }

    public async getBlob(sha: string): Promise<git.IBlob> {
        return null;
    }

    public getRawUrl(sha: string): string {
        return null;
    }
}

export class TestDocumentDeltaStorageService implements api.IDocumentDeltaStorageService {
    public get(from?: number, to?: number): Promise<api.ISequencedDocumentMessage[]> {
        throw new Error("Method not implemented.");
    }
}

export class TestDocumentService implements api.IDocumentService {
    private errorTracking = new socketStorage.DefaultErrorTracking();

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

    public getErrorTrackingService() {
        return this.errorTracking;
    }
}
