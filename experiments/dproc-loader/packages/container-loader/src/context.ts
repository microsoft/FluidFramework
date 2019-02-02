import {
    ConnectionState,
    IChaincodeHost,
    IComponentContext,
    IContext,
    IDocumentAttributes,
    IDocumentStorageService,
    IPlatform,
    IQuorum,
    IRequest,
    IResponse,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    IUser,
    MessageType,
} from "@prague/container-definitions";
import { BlobManager } from "./blobManager";
import { Container } from "./container";
import { DeltaManager } from "./deltaManager";

export class Context implements IContext {
    public static async Load(
        container: Container,
        chaincode: IChaincodeHost,                  // pass directly
        baseSnapshot: ISnapshotTree,                // pass directly
        blobs: Map<string, string>,                 // pass directly or combine with driver
        attributes: IDocumentAttributes,            // Potentially can be reloaded from snapshot
        blobManager: BlobManager,                   // inherit and/or limit
        deltaManager: DeltaManager,                 // inherit and/or limit
        quorum: IQuorum,                            // inherit and/or limit
        storage: IDocumentStorageService,           // inherit and/or limit
        submitFn: (type: MessageType, contents: any) => void,   // Following three are used to restrict access after
        snapshotFn: (message: string) => Promise<void>,         // a context transition
        closeFn: () => void,                        // When would the context ever close?
    ): Promise<Context> {
        const context = new Context(
            container,
            chaincode,
            baseSnapshot,
            blobs,
            attributes,
            blobManager,
            deltaManager,
            quorum,
            storage,
            submitFn,
            snapshotFn,
            closeFn);
        await context.load();

        return context;
    }

    public get tenantId(): string {
        return this.container.tenantId;
    }

    public get id(): string {
        return this.container.id;
    }

    public get clientId(): string {
        return this.container.clientId;
    }

    public get existing(): boolean {
        return this.container.existing;
    }

    public get branch(): string {
        return this.attributes.branch;
    }

    public get parentBranch(): string {
        return this.container.parentBranch;
    }

    public get minimumSequenceNumber(): number {
        return this._minimumSequenceNumber;
    }

    public get connectionState(): ConnectionState {
        return this.container.connectionState;
    }

    public get user(): IUser {
        return this.container.user;
    }

    // tslint:disable-next-line:no-unsafe-any
    public get options(): any {
        return this.container.options;
    }

    private contextPlatform: IPlatform;
    private componentContext: IComponentContext;
    // tslint:disable:variable-name allowing _ for params exposed with getter
    private _minimumSequenceNumber: number;
    // tslint:enable:variable-name

    constructor(
        private container: Container,
        public readonly chaincode: IChaincodeHost,
        public readonly baseSnapshot: ISnapshotTree,
        public readonly blobs: Map<string, string>,
        private readonly attributes: IDocumentAttributes,
        public readonly blobManager: BlobManager,
        public readonly deltaManager: DeltaManager,
        public readonly quorum: IQuorum,
        public readonly storage: IDocumentStorageService,
        public readonly submitFn: (type: MessageType, contents: any) => void,
        public readonly snapshotFn: (message: string) => Promise<void>,
        public readonly closeFn: () => void,
    ) {
        this._minimumSequenceNumber = attributes.minimumSequenceNumber;
    }

    public get ready(): Promise<void> {
        if (!this.componentContext) {
            return Promise.resolve();
        }

        return this.componentContext.ready;
    }

    public async snapshot(tagMessage: string): Promise<ITree> {
        if (!this.componentContext) {
            return null;
        }

        return this.componentContext.snapshot(tagMessage);
    }

    public changeConnectionState(value: ConnectionState, clientId: string) {
        if (!this.componentContext) {
            return;
        }

        this.componentContext.changeConnectionState(value, clientId);
    }

    public async stop(): Promise<ITree> {
        if (!this.componentContext) {
            return null;
        }

        const snapshot = await this.componentContext.snapshot("");
        await this.componentContext.stop();

        return snapshot;
    }

    public async prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        if (!this.componentContext) {
            return;
        }

        return this.componentContext.prepare(message, local);
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any) {
        if (!this.componentContext) {
            return;
        }

        this.componentContext.process(message, local, context);
    }

    public async postProcess(message: ISequencedDocumentMessage, local: boolean, context: any): Promise<void> {
        if (!this.componentContext) {
            return;
        }

        return this.componentContext.postProcess(message, local, context);
    }

    public updateMinSequenceNumber(minimumSequenceNumber: number) {
        if (!this.componentContext) {
            return;
        }

        this.componentContext.updateMinSequenceNumber(minimumSequenceNumber);
    }

    public async request(path: IRequest): Promise<IResponse> {
        if (!this.componentContext) {
            return { status: 404, mimeType: "text/plain", value: `${path} not found` };
        }

        return this.componentContext.request(path);
    }

    public error(err: any): void {
        throw new Error("Not implemented");
    }

    private async load() {
        this.contextPlatform = await this.chaincode.run(this);
        this.componentContext = await this.contextPlatform.queryInterface<IComponentContext>("context");
    }
}
