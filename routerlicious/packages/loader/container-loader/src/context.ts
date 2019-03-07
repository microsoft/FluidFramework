import {
    ConnectionState,
    IChaincodeFactory,
    IContainerContext,
    IDeltaManager,
    IDocumentAttributes,
    IDocumentMessage,
    IDocumentStorageService,
    ILoader,
    IQuorum,
    IRequest,
    IResponse,
    IRuntime,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITree,
    MessageType,
} from "@prague/container-definitions";
import { BlobManager } from "./blobManager";
import { Container } from "./container";

export class Context implements IContainerContext {
    public static async Load(
        container: Container,
        chaincode: IChaincodeFactory,
        baseSnapshot: ISnapshotTree,
        blobs: Map<string, string>,
        attributes: IDocumentAttributes,
        blobManager: BlobManager,
        deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        quorum: IQuorum,
        loader: ILoader,
        storage: IDocumentStorageService,
        errorFn: (err: any) => void,
        submitFn: (type: MessageType, contents: any) => number,
        snapshotFn: (message: string) => Promise<void>,
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
            loader,
            errorFn,
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

    // tslint:disable-next-line:no-unsafe-any
    public get options(): any {
        return this.container.options;
    }

    private runtime: IRuntime;
    // tslint:disable:variable-name allowing _ for params exposed with getter
    private _minimumSequenceNumber: number;
    // tslint:enable:variable-name

    constructor(
        private container: Container,
        public readonly chaincode: IChaincodeFactory,
        public readonly baseSnapshot: ISnapshotTree,
        public readonly blobs: Map<string, string>,
        private readonly attributes: IDocumentAttributes,
        public readonly blobManager: BlobManager,
        public readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        public readonly quorum: IQuorum,
        public readonly storage: IDocumentStorageService,
        public readonly loader: ILoader,
        private readonly errorFn: (err: any) => void,
        public readonly submitFn: (type: MessageType, contents: any) => number,
        public readonly snapshotFn: (message: string) => Promise<void>,
        public readonly closeFn: () => void,
    ) {
        this._minimumSequenceNumber = attributes.minimumSequenceNumber;
    }

    public async snapshot(tagMessage: string): Promise<ITree> {
        return this.runtime.snapshot(tagMessage);
    }

    public changeConnectionState(value: ConnectionState, clientId: string) {
        this.runtime.changeConnectionState(value, clientId);
    }

    public async stop(): Promise<ITree> {
        const snapshot = await this.runtime.snapshot("");
        await this.runtime.stop();

        return snapshot;
    }

    public async prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        return this.runtime.prepare(message, local);
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any) {
        this.runtime.process(message, local, context);
    }

    public async postProcess(message: ISequencedDocumentMessage, local: boolean, context: any): Promise<void> {
        return this.runtime.postProcess(message, local, context);
    }

    public async request(path: IRequest): Promise<IResponse> {
        return this.runtime.request(path);
    }

    public async requestSnapshot(tagMessage: string): Promise<void> {
        return this.container.snapshot(tagMessage);
    }

    public error(err: any): void {
        this.errorFn(err);
    }

    public registerTasks(tasks: string[]): any {
        return;
    }

    private async load() {
        this.runtime = await this.chaincode.instantiateRuntime(this);
    }
}
