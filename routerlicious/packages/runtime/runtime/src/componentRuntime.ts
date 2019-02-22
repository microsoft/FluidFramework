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
    IComponentRuntime,
    IEnvelope,
    IHostRuntime,
} from "@prague/runtime-definitions";
import { EventEmitter } from "events";

// tslint:disable:no-unsafe-any

export class ComponentRuntime extends EventEmitter implements IComponentRuntime {
    public static async create(
        hostRuntime: IHostRuntime,
        id: string,
        pkg: string,
        storage: IDocumentStorageService,
    ) {
        const factory = await hostRuntime.getPackage(pkg);
        const extension = await factory.instantiateComponent();
        const component = new ComponentRuntime(
            hostRuntime,
            pkg,
            id,
            false,
            extension,
            storage,
            null);

        return component;
    }

    public static async LoadFromSnapshot(
        hostRuntime: IHostRuntime,
        id: string,
        pkg: string,
        storage: IDocumentStorageService,
        channels: ISnapshotTree,
    ): Promise<ComponentRuntime> {
        const factory = await hostRuntime.getPackage(pkg);
        const extension = await factory.instantiateComponent();
        const component = new ComponentRuntime(
            hostRuntime,
            pkg,
            id,
            true,
            extension,
            storage,
            channels);

        return component;
    }

    public get tenantId(): string {
        return this.hostRuntime.tenantId;
    }

    public get documentId(): string {
        return this.hostRuntime.id;
    }

    public get parentBranch(): string {
        return this.hostRuntime.parentBranch;
    }

    public get options(): any {
        return this.hostRuntime.options;
    }

    public get clientId(): string {
        return this.hostRuntime.clientId;
    }

    public get blobManager(): IBlobManager {
        return this.hostRuntime.blobManager;
    }

    public get deltaManager(): IDeltaManager {
        return this.hostRuntime.deltaManager;
    }

    public get connected(): boolean {
        return this.hostRuntime.connected;
    }

    public get connectionState(): ConnectionState {
        return this.hostRuntime.connectionState;
    }

    public get submitFn(): (type: MessageType, contents: any) => void {
        return this.hostRuntime.submitFn;
    }

    public get snapshotFn(): (message: string) => Promise<void> {
        return this.hostRuntime.snapshotFn;
    }

    public get closeFn(): () => void {
        return this.hostRuntime.closeFn;
    }

    public get branch(): string {
        return this.hostRuntime.branch;
    }

    private closed = false;
    private handler: IComponentDeltaHandler;

    // Tracks the base snapshot hash. If no ops effect this component then the sha value can be returned on a
    // snapshot call
    private baseSha = null;

    private constructor(
        private readonly hostRuntime: IHostRuntime,
        private readonly pkg: string,
        public readonly id: string,
        public readonly existing: boolean,
        public readonly chaincode: IChaincodeComponent,
        public readonly storage: IDocumentStorageService,
        public readonly baseSnapshot: ISnapshotTree) {
        super();
        this.baseSha = baseSnapshot ? baseSnapshot.sha : null;
    }

    public createAndAttachComponent(id: string, pkg: string): Promise<IComponentRuntime> {
        return this.hostRuntime.createAndAttachComponent(id, pkg);
    }

    public getComponent(id: string, wait: boolean): Promise<IComponentRuntime> {
        return this.hostRuntime.getComponent(id, wait);
    }

    public changeConnectionState(value: ConnectionState, clientId: string) {
        this.verifyNotClosed();
        this.handler.changeConnectionState(value, clientId);
    }

    // Called after a snapshot to update the base sha
    public updateBaseSha(sha: string) {
        this.baseSha = sha;
    }

    public prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        this.verifyNotClosed();
        return this.handler.prepare(message, local);
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any): void {
        this.verifyNotClosed();
        // component has been modified and will need to regenerate its snapshot
        this.baseSha = null;
        return this.handler.process(message, local, context);
    }

    public getQuorum(): IQuorum {
        this.verifyNotClosed();
        return this.hostRuntime.getQuorum();
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
        this.hostRuntime.closeFn();
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

        // base sha still being set means previous snapshot is still valid
        if (this.baseSha) {
            snapshot.sha = this.baseSha;
        }

        return snapshot;
    }

    public async request(request: IRequest): Promise<IResponse> {
        return this.handler.request(request);
    }

    public submitMessage(type: MessageType, content: any): number {
        return this.submit(type, content);
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

    private submit(type: MessageType, content: any): number {
        this.verifyNotClosed();
        const envelope: IEnvelope = {
            address: this.id,
            contents: {
                content,
                type,
            },
        };
        return this.hostRuntime.submitFn(MessageType.Operation, envelope);
    }

    private verifyNotClosed() {
        if (this.closed) {
            throw new Error("Runtime is closed");
        }
    }
}
