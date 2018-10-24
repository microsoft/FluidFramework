import * as git from "@prague/gitresources";
import {
    IDocumentDeltaConnection,
    IDocumentDeltaStorageService,
    IDocumentMessage,
    IDocumentService,
    IDocumentStorageService,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    IUser,
} from "@prague/runtime-definitions";
import * as socketStorage from "@prague/socket-storage";
import { EventEmitter } from "events";

export class TestDocumentDeltaConnection extends EventEmitter implements IDocumentDeltaConnection {
    public readonly maxMessageSize = 16 * 1024;
    public existing: boolean;
    public parentBranch: string;
    public user: IUser;
    public clientId: string;
    public initialMessages: ISequencedDocumentMessage[] | undefined;
    public documentId: string;
    public encrypted: boolean;
    public privateKey: string;
    public publicKey: string;

    constructor() {
        super();
    }

    public submit(message: IDocumentMessage): void {
        throw new Error("Method not implemented.");
    }

    public disconnect() {
        return;
    }
}

export class TestDocumentStorageService implements IDocumentStorageService {
    public getSnapshotTree(version: git.ICommit): Promise<ISnapshotTree> {
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

    public write(root: ITree, parents: string[], message: string): Promise<git.ICommit> {
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

export class TestDocumentDeltaStorageService implements IDocumentDeltaStorageService {
    public get(from?: number, to?: number): Promise<ISequencedDocumentMessage[]> {
        throw new Error("Method not implemented.");
    }
}

export class TestDocumentService implements IDocumentService {
    private errorTracking = new socketStorage.DefaultErrorTracking();

    public async connectToStorage(id: string, token: string): Promise<IDocumentStorageService> {
        return new TestDocumentStorageService();
    }

    public async connectToDeltaStorage(id: string, token: string): Promise<IDocumentDeltaStorageService> {
        return new TestDocumentDeltaStorageService();
    }

    public async connectToDeltaStream(id: string, token: string): Promise<IDocumentDeltaConnection> {
        return new TestDocumentDeltaConnection();
    }

    public branch(id: string, token: string): Promise<string> {
        return Promise.reject("Not implemented");
    }

    public getErrorTrackingService() {
        return this.errorTracking;
    }
}
