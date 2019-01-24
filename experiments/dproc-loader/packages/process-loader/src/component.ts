import {
    IChaincodeComponent,
    IChaincodeHost,
    IComponentPlatform,
    IComponentRuntime,
    IDeltaHandler,
    IHostRuntime,
    IProcess,
} from "@prague/process-definitions";
import {
    ConnectionState,
    IChannel,
    IDocumentStorageService,
    IEnvelope,
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

export class Component extends EventEmitter implements IComponentRuntime, IProcess {
    public static async create(
        hostRuntime: IHostRuntime,
        tenantId: string,
        documentId: string,
        id: string,
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
        platform: IPlatform,
        branch: string,
        minimumSequenceNumber: number,
        submitFn: (type: MessageType, contents: any) => void,
        snapshotFn: (message: string) => Promise<void>,
        closeFn: () => void,
    ) {
        const module = (await chaincode.getModule(pkg)) as { instantiateComponent: () => Promise<IChaincodeComponent>};
        const extension = await module.instantiateComponent();

        const component = new Component(
            hostRuntime,
            tenantId,
            documentId,
            id,
            parentBranch,
            existing,
            options,
            clientId,
            user,
            blobManager,
            deltaManager,
            quorum,
            extension,
            storage,
            connectionState,
            platform,
            branch,
            minimumSequenceNumber,
            null,
            submitFn,
            snapshotFn,
            closeFn);

        return component;
    }

    public static async LoadFromSnapshot(
        hostRuntime: IHostRuntime,
        tenantId: string,
        documentId: string,
        id: string,
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
        platform: IPlatform,
        channels: ISnapshotTree,
        branch: string,
        minimumSequenceNumber: number,
        submitFn: (type: MessageType, contents: any) => void,
        snapshotFn: (message: string) => Promise<void>,
        closeFn: () => void,
    ): Promise<Component> {
        const module = (await chaincode.getModule(pkg)) as { instantiateComponent: () => Promise<IChaincodeComponent>};
        const extension = await module.instantiateComponent();

        const component = new Component(
            hostRuntime,
            tenantId,
            documentId,
            id,
            parentBranch,
            existing,
            options,
            clientId,
            user,
            blobManager,
            deltaManager,
            quorum,
            extension,
            storage,
            connectionState,
            platform,
            branch,
            minimumSequenceNumber,
            channels,
            submitFn,
            snapshotFn,
            closeFn);

        return component;
    }

    public get connected(): boolean {
        return this._connectionState === ConnectionState.Connected;
    }

    // Interface used to access the runtime code
    public get platform(): IPlatform {
        return this._platform;
    }

    public get connectionState(): ConnectionState {
        return this._connectionState;
    }

    private closed = false;
    private handler: IDeltaHandler;

    private constructor(
        private readonly hostRuntime: IHostRuntime,
        public readonly tenantId: string,
        public readonly documentId: string,
        public readonly id: string,
        public readonly parentBranch: string,
        public readonly existing: boolean,
        public readonly options: any,
        public clientId: string,
        public readonly user: IUser,
        public readonly blobManager: BlobManager,
        public readonly deltaManager: DeltaManager,
        private quorum: IQuorum,
        public readonly chaincode: IChaincodeComponent,
        public readonly storage: IDocumentStorageService,
        // tslint:disable:variable-name
        private _connectionState: ConnectionState,
        private _platform: IPlatform,
        // tslint:enable:variable-name
        public readonly branch: string,
        public readonly minimumSequenceNumber: number,
        public readonly baseSnapshot: ISnapshotTree,
        public readonly submitFn: (type: MessageType, contents: any) => void,
        public readonly snapshotFn: (message: string) => Promise<void>,
        public readonly closeFn: () => void) {
        super();
    }

    public createAndAttachProcess(id: string, pkg: string): Promise<IComponentRuntime> {
        return this.hostRuntime.createAndAttachProcess(id, pkg);
    }

    public getProcess(id: string, wait: boolean): Promise<IComponentRuntime> {
        return this.hostRuntime.getProcess(id, wait);
    }

    public async ready(): Promise<void> {
        this.verifyNotClosed();

        // TODOTODO this needs to defer to the runtime
    }

    public changeConnectionState(value: ConnectionState, clientId: string) {
        this.verifyNotClosed();

        if (value === this.connectionState) {
            return;
        }

        this._connectionState = value;
        this.clientId = clientId;
        this.handler.changeConnectionState(value, clientId);
    }

    public prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        this.verifyNotClosed();
        return this.handler.prepare(message, local);
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any): void {
        this.verifyNotClosed();
        return this.handler.process(message, local, context);
    }

    public getQuorum(): IQuorum {
        this.verifyNotClosed();

        return this.quorum;
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
        this.handler.updateMinSequenceNumber(msn);
    }

    public snapshot(): ITree {
        return null;
    }

    public submitMessage(type: MessageType, content: any) {
        this.submit(type, content);
    }

    public error(err: any): void {
        return;
    }

    public async start(): Promise<void> {
        this.verifyNotClosed();

        //  The component needs to have both a create and a load call (I believe). Or load can be invoked
        // with no starting data.
        //  Once the above are called it can begin processing events and model data
        //  Some trigger can happen to then allow it to take part in the UI

        // TODOTODO need to understand start logic
        this.handler = await this.chaincode.run(this, this.platform);
    }

    public async attach(platform: IComponentPlatform): Promise<IComponentPlatform> {
        return this.chaincode.attach(platform);
    }

    private submit(type: MessageType, content: any) {
        this.verifyNotClosed();
        const envelope: IEnvelope = {
            address: this.id,
            contents: {
                content,
                type,
            },
        };
        this.submitFn(MessageType.Operation, envelope);
    }

    private verifyNotClosed() {
        if (this.closed) {
            throw new Error("Runtime is closed");
        }
    }
}
