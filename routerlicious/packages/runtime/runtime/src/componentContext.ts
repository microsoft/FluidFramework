import {
    ConnectionState,
    FileMode,
    IBlobManager,
    IDeltaManager,
    IDocumentMessage,
    IDocumentStorageService,
    IGenericBlob,
    ILoader,
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
    IComponentContext,
    IComponentRuntime,
    IEnvelope,
    IHostRuntime,
    IInboundSignalMessage,
} from "@prague/runtime-definitions";
import { EventEmitter } from "events";

export class ComponentContext extends EventEmitter implements IComponentContext {
    public get tenantId(): string {
        return this.hostRuntime.tenantId;
    }

    public get documentId(): string {
        return this.hostRuntime.id;
    }

    public get parentBranch(): string {
        return this.hostRuntime.parentBranch;
    }

    // tslint:disable-next-line:no-unsafe-any
    public get options(): any {
        return this.hostRuntime.options;
    }

    public get clientId(): string {
        return this.hostRuntime.clientId;
    }

    public get clientType(): string {
        return this.hostRuntime.clientType;
    }

    public get blobManager(): IBlobManager {
        return this.hostRuntime.blobManager;
    }

    public get deltaManager(): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
        return this.hostRuntime.deltaManager;
    }

    public get connected(): boolean {
        return this.hostRuntime.connected;
    }

    public get leader(): boolean {
        return this.hostRuntime.leader;
    }

    public get connectionState(): ConnectionState {
        return this.hostRuntime.connectionState;
    }

    public get submitFn(): (type: MessageType, contents: any) => void {
        return this.hostRuntime.submitFn;
    }

    public get submitSignalFn(): (contents: any) => void {
        return this.hostRuntime.submitSignalFn;
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

    public get loader(): ILoader {
        return this.hostRuntime.loader;
    }

    public get component(): IComponentRuntime {
        return this._component;
    }

    private closed = false;
    // tslint:disable-next-line:variable-name
    private _component: IComponentRuntime;

    // Tracks the base snapshot hash. If no ops effect this component then the sha value can be returned on a
    // snapshot call
    private baseSha = null;

    constructor(
        private readonly hostRuntime: IHostRuntime,
        private readonly pkg: string,
        public readonly id: string,
        public readonly existing: boolean,
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
        this._component.changeConnectionState(value, clientId);
    }

    // Called after a snapshot to update the base sha
    public updateBaseSha(sha: string) {
        this.baseSha = sha;
    }

    public prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        this.verifyNotClosed();
        return this._component.prepare(message, local);
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any): void {
        this.verifyNotClosed();
        // component has been modified and will need to regenerate its snapshot
        this.baseSha = null;
        return this._component.process(message, local, context);
    }

    public processSignal(message: IInboundSignalMessage, local: boolean): void {
        this.verifyNotClosed();
        return this._component.processSignal(message, local);
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

    public snapshot(): ITree {
        const componentAttributes = { pkg: this.pkg };

        const entries = this._component.snapshotInternal();
        const snapshot = { entries, sha: undefined };

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
        return this._component.request(request);
    }

    public submitMessage(type: MessageType, content: any): number {
        return this.submitOp(type, content);
    }

    public submitSignal(type: string, content: any) {
        this.verifyNotClosed();
        const envelope: IEnvelope = {
            address: this.id,
            contents: {
                content,
                type,
            },
        };
        return this.hostRuntime.submitSignalFn(envelope);
    }

    public error(err: any): void {
        return;
    }

    public async start(): Promise<IComponentRuntime> {
        const factory = await this.hostRuntime.getPackage(this.pkg);
        this._component = await factory.instantiateComponent(this);
        return this._component;
    }

    public updateLeader(clientId: string) {
        this.emit("leader", clientId);
    }

    private submitOp(type: MessageType, content: any): number {
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
