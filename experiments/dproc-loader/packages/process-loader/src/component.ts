import { IChaincodeHost } from "@prague/process-definitions";
import {
    ConnectionState,
    IChannel,
    IDocumentStorageService,
    IGenericBlob,
    IObjectStorageService,
    IPlatform,
    IQuorum,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    IUser,
    MessageType,
} from "@prague/runtime-definitions";
import { EventEmitter } from "events";
import { BlobManager } from "./blobManager";
import { ChannelDeltaConnection } from "./channelDeltaConnection";
import { DeltaManager } from "./deltaManager";

export interface IChannelState {
    object: IChannel;
    storage: IObjectStorageService;
    connection: ChannelDeltaConnection;
}

export class Component extends EventEmitter {
    public static async LoadFromSnapshot(
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
        tardisMessages: Map<string, ISequencedDocumentMessage[]>,
        deltaManager: DeltaManager,
        quorum: IQuorum,
        storage: IDocumentStorageService,
        connectionState: ConnectionState,
        channels: ISnapshotTree,
        branch: string,
        minimumSequenceNumber: number,
        submitFn: (type: MessageType, contents: any) => void,
        snapshotFn: (message: string) => Promise<void>,
        closeFn: () => void): Promise<Component> {

        const component = new Component(
            tenantId,
            id,
            parentBranch,
            existing,
            options,
            clientId,
            user,
            blobManager,
            deltaManager,
            quorum,
            pkg,
            chaincode,
            storage,
            connectionState,
            submitFn,
            snapshotFn,
            closeFn);

        await component.start(platform);

        return component;
    }

    public get connected(): boolean {
        return this.connectionState === ConnectionState.Connected;
    }

    // Interface used to access the runtime code
    public get platform(): IPlatform {
        return this._platform;
    }

    private closed = false;

    // tslint:disable-next-line:variable-name
    private _platform: IPlatform;
    // tslint:enable-next-line:variable-name

    private constructor(
        public readonly tenantId: string,
        public readonly id: string,
        public readonly parentBranch: string,
        public existing: boolean,
        public readonly options: any,
        public clientId: string,
        public readonly user: IUser,
        private blobManager: BlobManager,
        public readonly deltaManager: DeltaManager,
        private quorum: IQuorum,
        public readonly pkg: string,
        public readonly chaincode: IChaincodeHost,
        storageService: IDocumentStorageService,
        private connectionState: ConnectionState,
        private submitFn: (type: MessageType, contents: any) => void,
        snapshotFn: (message: string) => Promise<void>,
        private closeFn: () => void) {
        super();
    }

    public async ready(): Promise<void> {
        this.verifyNotClosed();

        // TODOTODO this needs to defer to the runtime
    }

    public async start(platform: IPlatform): Promise<void> {
        this.verifyNotClosed();

        // TODOTODO need to understand start logic
    }

    public changeConnectionState(value: ConnectionState, clientId: string) {
        this.verifyNotClosed();

        if (value === this.connectionState) {
            return;
        }

        this.connectionState = value;
        this.clientId = clientId;

        // TODOTODO pass on to runtime
    }

    public prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        this.verifyNotClosed();

        // TODOTODO need to forward to runtime

        return Promise.resolve();
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any): void {
        this.verifyNotClosed();

        // TODOTODO need to forward to runtime
    }

    public getQuorum(): IQuorum {
        this.verifyNotClosed();

        return this.quorum;
    }

    public transform(message: ISequencedDocumentMessage, sequenceNumber: number) {
        // TODOTODO transfer on to the runtime
    }

    public async getBlobMetadata(): Promise<IGenericBlob[]> {
        return this.blobManager.getBlobMetadata();
    }

    public stop(): ITree {
        this.verifyNotClosed();

        this.closed = true;

        return this.snapshot();
    }

    public close(): void {
        this.closeFn();
    }

    public updateMinSequenceNumber(msn: number) {
        // TODOTODO forward on to channel
    }

    public snapshot(): ITree {
        // TODOTODO rip through the channel
        return null;
    }

    public submitMessage(type: MessageType, content: any) {
        this.submit(type, content);
    }

    private submit(type: MessageType, content: any) {
        this.verifyNotClosed();
        this.submitFn(type, content);
    }

    private verifyNotClosed() {
        if (this.closed) {
            throw new Error("Runtime is closed");
        }
    }
}
