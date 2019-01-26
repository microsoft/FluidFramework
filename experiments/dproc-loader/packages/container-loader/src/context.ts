import { IChaincodeHost } from "@prague/process-definitions";
import {
    ConnectionState,
    IDocumentStorageService,
    IPlatform,
    IQuorum,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    IUser,
    MessageType,
} from "@prague/runtime-definitions";
import { BlobManager } from "./blobManager";
import { DeltaManager } from "./deltaManager";

export class Context {
    public static async Load(
        tenantId: string,
        id: string,
        platform: IPlatform,
        parentBranch: string,
        existing: boolean,
        options: any,
        clientId: string,
        user: IUser,
        blobManager: BlobManager,
        pkg: string,
        chaincode: IChaincodeHost,
        deltaManager: DeltaManager,
        quorum: IQuorum,
        storage: IDocumentStorageService,
        connectionState: ConnectionState,
        components: Map<string, ISnapshotTree>,
        extraBlobs: Map<string, string>,
        branch: string,
        minimumSequenceNumber: number,
        submitFn: (type: MessageType, contents: any) => void,
        snapshotFn: (message: string) => Promise<void>,
        closeFn: () => void,
    ): Promise<Context> {
        return Promise.reject("Not implemented");
    }

    public get ready(): Promise<void> {
        return Promise.reject("Not implemented");
    }

    // TODO should just be a ITree
    public snapshot(): Map<string, ITree> {
        throw new Error("Not implemented");
    }

    public changeConnectionState(value: ConnectionState, clientId: string) {
        throw new Error("Not implemented");
    }

    public stop(): { snapshot: Map<string, ISnapshotTree>, blobs: Map<string, string> } {
        throw new Error("Not implemented");
    }

    public prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        return Promise.reject("Not implemented");
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any) {
        throw new Error("Not implemented");
    }

    public async postProcess(message: ISequencedDocumentMessage, local: boolean, context: any): Promise<void> {
        return Promise.reject("Not implemented");
    }

    public updateMinSequenceNumber(minimumSequenceNumber: number) {
        throw new Error("Not implemented");
    }
}
