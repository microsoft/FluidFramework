import {
    ConnectionState,
    IChaincodeFactory,
    ICodeLoader,
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
    ISignalMessage,
    ISnapshotTree,
    ITree,
    MessageType,
} from "@prague/container-definitions";
import { BlobManager } from "./blobManager";
import { Container } from "./container";

export class ContainerContext implements IContainerContext {
    public static async Load(
        container: Container,
        codeLoader: ICodeLoader,
        chaincode: IChaincodeFactory,
        baseSnapshot: ISnapshotTree | null,
        blobs: Map<string, string>,
        attributes: IDocumentAttributes,
        blobManager: BlobManager | undefined,
        deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> | undefined,
        quorum: IQuorum | undefined,
        loader: ILoader,
        storage: IDocumentStorageService | null | undefined,
        errorFn: (err: any) => void,
        submitFn: (type: MessageType, contents: any) => number,
        submitSignalFn: (contents: any) => void,
        snapshotFn: (message: string) => Promise<void>,
        closeFn: () => void,                        // When would the context ever close?
    ): Promise<ContainerContext> {
        const context = new ContainerContext(
            container,
            codeLoader,
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
            submitSignalFn,
            snapshotFn,
            closeFn);
        await context.load();

        return context;
    }

    public get id(): string {
        return this.container.id;
    }

    public get clientId(): string | undefined {
        return this.container.clientId;
    }

    public get clientType(): string {
        return this.container.clientType;
    }

    public get existing(): boolean | undefined {
        return this.container.existing;
    }

    public get branch(): string {
        return this.attributes.branch;
    }

    public get parentBranch(): string | undefined | null {
        return this.container.parentBranch;
    }

    public get minimumSequenceNumber(): number | undefined {
        return this._minimumSequenceNumber;
    }

    public get connectionState(): ConnectionState {
        return this.container.connectionState;
    }

    // tslint:disable-next-line:no-unsafe-any
    public get options(): any {
        return this.container.options;
    }

    private runtime: IRuntime | undefined;
    // tslint:disable:variable-name allowing _ for params exposed with getter
    private _minimumSequenceNumber: number | undefined;
    // tslint:enable:variable-name

    constructor(
        private container: Container,
        public readonly codeLoader: ICodeLoader,
        public readonly chaincode: IChaincodeFactory,
        public readonly baseSnapshot: ISnapshotTree | null,
        public readonly blobs: Map<string, string>,
        private readonly attributes: IDocumentAttributes,
        public readonly blobManager: BlobManager | undefined,
        public readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> | undefined,
        public readonly quorum: IQuorum | undefined,
        public readonly storage: IDocumentStorageService | undefined | null,
        public readonly loader: ILoader,
        private readonly errorFn: (err: any) => void,
        public readonly submitFn: (type: MessageType, contents: any) => number,
        public readonly submitSignalFn: (contents: any) => void,
        public readonly snapshotFn: (message: string) => Promise<void>,
        public readonly closeFn: () => void,
    ) {
        this._minimumSequenceNumber = attributes.minimumSequenceNumber;
    }

    public async snapshot(tagMessage: string): Promise<ITree | null> {
        return this.runtime!.snapshot(tagMessage);
    }

    public changeConnectionState(value: ConnectionState, clientId: string) {
        this.runtime!.changeConnectionState(value, clientId);
    }

    public async stop(): Promise<ITree | null> {
        const snapshot = await this.runtime!.snapshot("");
        await this.runtime!.stop();

        return snapshot;
    }

    public async prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        return this.runtime!.prepare(message, local);
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any) {
        this.runtime!.process(message, local, context);
    }

    public async postProcess(message: ISequencedDocumentMessage, local: boolean, context: any): Promise<void> {
        return this.runtime!.postProcess(message, local, context);
    }

    public processSignal(message: ISignalMessage, local: boolean) {
        this.runtime!.processSignal(message, local);
    }

    public async request(path: IRequest): Promise<IResponse> {
        return this.runtime!.request(path);
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
