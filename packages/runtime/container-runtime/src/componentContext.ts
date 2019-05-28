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

    public get documentId(): string {
        return this._hostRuntime.id;
    }

    public get parentBranch(): string {
        return this._hostRuntime.parentBranch;
    }

    // tslint:disable-next-line:no-unsafe-any
    public get options(): any {
        return this._hostRuntime.options;
    }

    public get clientId(): string {
        return this._hostRuntime.clientId;
    }

    public get clientType(): string {
        return this._hostRuntime.clientType;
    }

    public get blobManager(): IBlobManager {
        return this._hostRuntime.blobManager;
    }

    public get deltaManager(): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
        return this._hostRuntime.deltaManager;
    }

    public get connected(): boolean {
        return this._hostRuntime.connected;
    }

    public get leader(): boolean {
        return this._hostRuntime.leader;
    }

    public get connectionState(): ConnectionState {
        return this._hostRuntime.connectionState;
    }

    public get submitFn(): (type: MessageType, contents: any) => void {
        return this._hostRuntime.submitFn;
    }

    public get submitSignalFn(): (contents: any) => void {
        return this._hostRuntime.submitSignalFn;
    }

    public get snapshotFn(): (message: string) => Promise<void> {
        return this._hostRuntime.snapshotFn;
    }

    public get closeFn(): () => void {
        return this._hostRuntime.closeFn;
    }

    public get branch(): string {
        return this._hostRuntime.branch;
    }

    public get loader(): ILoader {
        return this._hostRuntime.loader;
    }

    public get hostRuntime(): IHostRuntime {
        return this._hostRuntime;
    }

    public get componentRuntime(): IComponentRuntime {
        return this._componentRuntime;
    }

    private closed = false;
    // tslint:disable-next-line:variable-name
    private _componentRuntime: IComponentRuntime;

    // Tracks the base snapshot hash. If no ops effect this component then the sha value can be returned on a
    // snapshot call
    private baseId = null;

    constructor(
        // tslint:disable-next-line:variable-name
        private readonly _hostRuntime: IHostRuntime,
        private readonly pkg: string,
        public readonly id: string,
        public readonly existing: boolean,
        public readonly storage: IDocumentStorageService,
        public readonly baseSnapshot: ISnapshotTree) {
        super();
        this.baseId = baseSnapshot ? baseSnapshot.id : null;
    }

    public createAndAttachComponent(id: string, pkg: string): Promise<IComponentRuntime> {
        return this._hostRuntime.createAndAttachComponent(id, pkg);
    }

    public getComponentRuntime(id: string, wait: boolean): Promise<IComponentRuntime> {
        return this._hostRuntime.getComponentRuntime(id, wait);
    }

    public changeConnectionState(value: ConnectionState, clientId: string) {
        this.verifyNotClosed();
        this._componentRuntime.changeConnectionState(value, clientId);
    }

    // Called after a snapshot to update the base sha
    public updateBaseId(sha: string) {
        this.baseId = sha;
    }

    public prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        this.verifyNotClosed();
        return this._componentRuntime.prepare(message, local);
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any): void {
        this.verifyNotClosed();
        // component has been modified and will need to regenerate its snapshot
        this.baseId = null;
        return this._componentRuntime.process(message, local, context);
    }

    public processSignal(message: IInboundSignalMessage, local: boolean): void {
        this.verifyNotClosed();
        return this._componentRuntime.processSignal(message, local);
    }

    public getQuorum(): IQuorum {
        this.verifyNotClosed();
        return this._hostRuntime.getQuorum();
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
        this._hostRuntime.closeFn();
    }

    public snapshot(): ITree {
        const componentAttributes = { pkg: this.pkg };

        const entries = this._componentRuntime.snapshotInternal();
        const snapshot = { entries, id: undefined };

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
        if (this.baseId) {
            snapshot.id = this.baseId;
        }

        return snapshot;
    }

    public async request(request: IRequest): Promise<IResponse> {
        return this._componentRuntime.request(request);
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
        return this._hostRuntime.submitSignalFn(envelope);
    }

    public error(err: any): void {
        return;
    }

    public async start(): Promise<IComponentRuntime> {
        const factory = await this._hostRuntime.getPackage(this.pkg);
        this._componentRuntime = await factory.instantiateComponent(this);
        return this._componentRuntime;
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
        return this._hostRuntime.submitFn(MessageType.Operation, envelope);
    }

    private verifyNotClosed() {
        if (this.closed) {
            throw new Error("Runtime is closed");
        }
    }
}
