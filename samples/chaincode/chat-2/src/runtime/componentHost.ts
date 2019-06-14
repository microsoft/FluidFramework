import {
    ConnectionState,
    IBlobManager,
    IDeltaManager,
    IDocumentMessage,
    IDocumentStorageService,
    IGenericBlob,
    ILoader,
    IPlatform,
    IQuorum,
    IRequest,
    IResponse,
    ISequencedDocumentMessage,
    ITreeEntry,
    MessageType,
} from "@prague/container-definitions";
import {
    IAttachMessage,
    IChaincode,
    IChaincodeComponent,
    IChannel,
    IComponentDeltaHandler,
    IComponentRuntime,
    ISharedObjectServices,
    IRuntime,
} from "@prague/runtime-definitions";
import { gitHashFile } from "@prague/utils";
import { EventEmitter } from "events";

class ServicePlatform extends EventEmitter implements IPlatform {
    private readonly qi: Map<string, Promise<any>>;

    constructor(services?: ReadonlyArray<[string, Promise<any>]>) {
        super();
        this.qi = new Map(services);
    }

    public queryInterface<T>(id: string): Promise<T> {
        return this.qi.get(id) || Promise.reject(`queryInterface() failed - Unknown id '${id}'.`);
    }

    public detach() {
        return;
    }
}

/**
 * Base component class
 */
export class ComponentHost extends EventEmitter implements IComponentDeltaHandler, IRuntime {
    public static async LoadFromSnapshot(
        componentRuntime: IComponentRuntime,
        chaincode: IChaincode,
    ) {
        const runtime = new ComponentHost(
            componentRuntime,
            componentRuntime.tenantId,
            componentRuntime.documentId,
            componentRuntime.id,
            componentRuntime.parentBranch,
            componentRuntime.existing,
            componentRuntime.options,
            componentRuntime.blobManager,
            componentRuntime.deltaManager,
            componentRuntime.getQuorum(),
            chaincode,
            componentRuntime.storage,
            componentRuntime.snapshotFn,
            componentRuntime.closeFn);

        // Start the runtime
        await runtime.start();

        return runtime;
    }

    public get connected(): boolean {
        return this.componentRuntime.connected;
    }

    // Interface used to access the runtime code
    public get platform(): IPlatform {
        return this._platform;
    }

    public get clientId(): string {
        return this.componentRuntime.clientId;
    }

    public get clientType(): string {
        return this.componentRuntime.clientType;
    }

    public get loader(): ILoader {
        return this.componentRuntime.loader;
    }

    private closed = false;
    private pendingAttach = new Map<string, IAttachMessage>();

    // tslint:disable-next-line:variable-name
    private _platform: IPlatform;
    // tslint:enable-next-line:variable-name

    private constructor(
        private readonly componentRuntime: IComponentRuntime,
        public readonly tenantId: string,
        public readonly documentId: string,
        public readonly id: string,
        public readonly parentBranch: string,
        public existing: boolean,
        public readonly options: any,
        private blobManager: IBlobManager,
        public readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        private quorum: IQuorum,
        private readonly chaincode: IChaincode,
        private storageService: IDocumentStorageService,
        private snapshotFn: (message: string) => Promise<void>,
        private closeFn: () => void) {
        super();
    }

    public createAndAttachComponent(id: string, pkg: string): Promise<IComponentRuntime> {
        return this.componentRuntime.createAndAttachComponent(id, pkg);
    }

    public getComponent(id: string, wait: boolean): Promise<IComponentRuntime> {
        return this.componentRuntime.getComponent(id, wait);
    }

    /**
     * Opens the component with the given 'id'.  Once the component is retrieved, it is attached
     * with the given list of services.
     */
    public async openComponent<T extends IChaincodeComponent>(
        id: string,
        wait: boolean,
        services?: ReadonlyArray<[string, Promise<any>]>,
    ): Promise<T> {
        const runtime = await this.componentRuntime.getComponent(id, wait);
        const platform = await runtime.attach(new ServicePlatform(services));
        return platform.queryInterface("component");
    }

    public async request(request: IRequest): Promise<IResponse> {
        return;
    }

    public getChannel(id: string): Promise<IChannel> {
        this.verifyNotClosed();
        return;
    }

    public createChannel(id: string, type: string): IChannel {
        this.verifyNotClosed();
        return;
    }

    public attachChannel(channel: IChannel): ISharedObjectServices {
        this.verifyNotClosed();
        return;
    }

    public async start(): Promise<void> {
        this.verifyNotClosed();
        this._platform = await this.chaincode.run(this, null);
    }

    public changeConnectionState(value: ConnectionState, clientId: string) {
        this.verifyNotClosed();

        // Resend all pending attach messages prior to notifying clients
        if (value === ConnectionState.Connected) {
            for (const [, message] of this.pendingAttach) {
                this.submit(MessageType.Attach, message);
            }
        }

        if (value === ConnectionState.Connected) {
            this.emit("connected", clientId);
        } else {
            this.emit("disconnected");
        }
    }

    public getQuorum(): IQuorum {
        this.verifyNotClosed();

        return this.quorum;
    }

    public snapshot(message: string): Promise<void> {
        this.verifyNotClosed();

        return this.snapshotFn(message);
    }

    public save(tag: string) {
        this.verifyNotClosed();
        this.submit(MessageType.Save, tag);
    }

    public async uploadBlob(file: IGenericBlob): Promise<IGenericBlob> {
        this.verifyNotClosed();

        const sha = gitHashFile(file.content);
        file.sha = sha;
        file.url = this.storageService.getRawUrl(sha);

        await this.blobManager.createBlob(file);
        this.submit(MessageType.BlobUploaded, await this.blobManager.createBlob(file));

        return file;
    }

    public getBlob(sha: string): Promise<IGenericBlob> {
        this.verifyNotClosed();

        return this.blobManager.getBlob(sha);
    }

    public async getBlobMetadata(): Promise<IGenericBlob[]> {
        return this.blobManager.getBlobMetadata();
    }

    public stop(): ITreeEntry[] {
        this.verifyNotClosed();

        this.closed = true;

        return this.snapshotInternal();
    }

    public close(): void {
        this.closeFn();
    }

    public async prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        return;
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any) {
        let target: IChannel = null;
        this.emit("op", message, target);
    }

    public updateMinSequenceNumber(msn: number) {
        // Not needed
    }

    // Good place to write your own snapshot method.
    public snapshotInternal(): ITreeEntry[] {
        const entries = new Array<ITreeEntry>();
        return entries;
    }

    public submitMessage(type: MessageType, content: any) {
        this.submit(type, content);
    }

    private submit(type: MessageType, content: any): number {
        this.verifyNotClosed();
        return this.componentRuntime.submitMessage(type, content);
    }

    private verifyNotClosed() {
        if (this.closed) {
            throw new Error("Runtime is closed");
        }
    }
}
