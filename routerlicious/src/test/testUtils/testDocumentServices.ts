import * as git from "gitresources";
import * as api from "../../api-core";

export class TestDocumentDeltaConnection implements api.IDocumentDeltaConnection {
    public clientId: string;
    public documentId: string;
    public encrypted: boolean;
    public privateKey: string;
    public publicKey: string;

    public on(event: string, listener: Function): this {
        throw new Error("Method not implemented.");
    }

    public submit(message: api.IDocumentMessage): Promise<void> {
        throw new Error("Method not implemented.");
    }

    public dispatchEvent(name: string, ...args: any[]) {
        throw new Error("Method not implemented.");
    }
}

export class TestDocumentStorageService implements api.IDocumentStorageService {
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
    public connect(
        id: string,
        version: git.ICommit,
        connect: boolean): Promise<api.IDocumentResource> {

        const clientId = "Fill me in!";
        const existing = false;
        const distributedObjects: api.IDistributedObject[] = [];
        const transformedMessages: api.ISequencedDocumentMessage[] = [];
        const pendingDeltas: api.ISequencedDocumentMessage[] = [];
        const minimumSequenceNumber = 0;
        const sequenceNumber = 0;
        const tree: api.ISnapshotTree = null;

        const document: api.IDocumentResource = {
            clientId,
            deltaConnection: new TestDocumentDeltaConnection(),
            deltaStorageService: new TestDocumentDeltaStorageService(),
            distributedObjects,
            documentId: id,
            documentStorageService: new TestDocumentStorageService(),
            existing,
            minimumSequenceNumber,
            parentBranch: null,
            pendingDeltas,
            sequenceNumber,
            snapshotOriginBranch: id,
            transformedMessages,
            tree,
            user: null,
            version,
        };

        return Promise.resolve(document);
    }

    public branch(id: string): Promise<string> {
        return Promise.reject("Not implemented");
    }
}
