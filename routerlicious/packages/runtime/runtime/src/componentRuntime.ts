import {
    ConnectionState,
    FileMode,
    IBlobManager,
    IDeltaManager,
    IDocumentStorageService,
    IGenericBlob,
    IPlatform,
    IQuorum,
    IRequest,
    IResponse,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    MessageType,
    TreeEntry,
} from "@prague/container-definitions";
import {
    IChaincodeComponent,
    IComponentDeltaHandler,
    IComponentFactory,
    IComponentRuntime,
    IEnvelope,
    IHostRuntime,
} from "@prague/runtime-definitions";
import { EventEmitter } from "events";

// tslint:disable:no-unsafe-any

export class ComponentRuntime extends EventEmitter implements IComponentRuntime {
    public static async create(
        factory: IComponentFactory,
        hostRuntime: IHostRuntime,
        tenantId: string,
        documentId: string,
        id: string,
        parentBranch: string,
        options: any,
        clientId: string,
        blobManager: IBlobManager,
        pkg: string,
        deltaManager: IDeltaManager,
        quorum: IQuorum,
        storage: IDocumentStorageService,
        connectionState: ConnectionState,
        branch: string,
        minimumSequenceNumber: number,
        submitFn: (type: MessageType, contents: any) => void,
        snapshotFn: (message: string) => Promise<void>,
        closeFn: () => void,
    ) {
        const extension = await factory.instantiateComponent();
        const component = new ComponentRuntime(
            pkg,
            hostRuntime,
            tenantId,
            documentId,
            id,
            parentBranch,
            false,
            options,
            clientId,
            blobManager,
            deltaManager,
            quorum,
            extension,
            storage,
            connectionState,
            branch,
            minimumSequenceNumber,
            null,
            submitFn,
            snapshotFn,
            closeFn);

        return component;
    }

    public static async LoadFromSnapshot(
        factory: IComponentFactory,
        hostRuntime: IHostRuntime,
        tenantId: string,
        documentId: string,
        id: string,
        parentBranch: string,
        options: any,
        clientId: string,
        blobManager: IBlobManager,
        pkg: string,
        deltaManager: IDeltaManager,
        quorum: IQuorum,
        storage: IDocumentStorageService,
        connectionState: ConnectionState,
        channels: ISnapshotTree,
        branch: string,
        minimumSequenceNumber: number,
        submitFn: (type: MessageType, contents: any) => void,
        snapshotFn: (message: string) => Promise<void>,
        closeFn: () => void,
    ): Promise<ComponentRuntime> {
        const extension = await factory.instantiateComponent();
        const component = new ComponentRuntime(
            pkg,
            hostRuntime,
            tenantId,
            documentId,
            id,
            parentBranch,
            true,
            options,
            clientId,
            blobManager,
            deltaManager,
            quorum,
            extension,
            storage,
            connectionState,
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

    public get connectionState(): ConnectionState {
        return this._connectionState;
    }

    private closed = false;
    private handler: IComponentDeltaHandler;

    private constructor(
        private readonly pkg: string,
        private readonly hostRuntime: IHostRuntime,
        public readonly tenantId: string,
        public readonly documentId: string,
        public readonly id: string,
        public readonly parentBranch: string,
        public readonly existing: boolean,
        public readonly options: any,
        public clientId: string,
        public readonly blobManager: IBlobManager,
        public readonly deltaManager: IDeltaManager,
        private quorum: IQuorum,
        public readonly chaincode: IChaincodeComponent,
        public readonly storage: IDocumentStorageService,
        // tslint:disable:variable-name
        private _connectionState: ConnectionState,
        // tslint:enable:variable-name
        public readonly branch: string,
        public readonly minimumSequenceNumber: number,
        public readonly baseSnapshot: ISnapshotTree,
        public readonly submitFn: (type: MessageType, contents: any) => void,
        public readonly snapshotFn: (message: string) => Promise<void>,
        public readonly closeFn: () => void) {
        super();
    }

    public createAndAttachComponent(id: string, pkg: string): Promise<IComponentRuntime> {
        return this.hostRuntime.createAndAttachComponent(id, pkg);
    }

    public getComponent(id: string, wait: boolean): Promise<IComponentRuntime> {
        return this.hostRuntime.getComponent(id, wait);
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
        const componentAttributes = { pkg: this.pkg };

        const snapshot = this.chaincode.snapshot();
        snapshot.entries.push({
            mode: FileMode.File,
            path: ".component",
            type: TreeEntry[TreeEntry.Blob],
            value: {
                contents: JSON.stringify(componentAttributes),
                encoding: "utf-8",
            },
        });

        return snapshot;
    }

    public async request(request: IRequest): Promise<IResponse> {
        return this.handler.request(request);
    }

    public submitMessage(type: MessageType, content: any) {
        this.submit(type, content);
    }

    public error(err: any): void {
        return;
    }

    public async start(): Promise<void> {
        this.verifyNotClosed();
        this.handler = await this.chaincode.run(this);
    }

    public async attach(platform: IPlatform): Promise<IPlatform> {
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
