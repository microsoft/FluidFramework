/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    ConnectionState,
    ICodeLoader,
    IComponentConfiguration,
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
    IRuntimeFactory,
    ISequencedDocumentMessage,
    ISignalMessage,
    ISnapshotTree,
    ISummaryTree,
    ITelemetryLogger,
    ITree,
    MessageType,
} from "@prague/container-definitions";
import { raiseConnectedEvent } from "@prague/utils";
import { EventEmitter } from "events";
import { BlobManager } from "./blobManager";
import { Container } from "./container";

export class ContainerContext extends EventEmitter implements IContainerContext {
    public static supportedInterfaces = [
        "IMessageScheduler",
    ];

    public static async load(
        container: Container,
        codeLoader: ICodeLoader,
        chaincode: IRuntimeFactory,
        baseSnapshot: ISnapshotTree | null,
        attributes: IDocumentAttributes,
        blobManager: BlobManager | undefined,
        deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        quorum: IQuorum,
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

    public readonly logger: ITelemetryLogger;

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

    public get connected(): boolean {
        return this.connectionState === ConnectionState.Connected;
    }

    public get canSummarize(): boolean {
        return "summarize" in this.runtime!;
    }

    // tslint:disable-next-line:no-unsafe-any
    public get options(): any {
        return this.container.options;
    }

    public get configuration(): IComponentConfiguration {
        return {
            canReconnect: this.container.canReconnect,
        };
    }

    // Back compat flag - can remove in 0.6
    public legacyMessaging = true;

    private runtime: IRuntime | undefined;
    // tslint:disable:variable-name allowing _ for params exposed with getter
    private readonly _minimumSequenceNumber: number | undefined;
    // tslint:enable:variable-name

    constructor(
        private readonly container: Container,
        public readonly codeLoader: ICodeLoader,
        public readonly chaincode: IRuntimeFactory,
        public readonly baseSnapshot: ISnapshotTree | null,
        private readonly attributes: IDocumentAttributes,
        public readonly blobManager: BlobManager | undefined,
        public readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        public readonly quorum: IQuorum,
        public readonly storage: IDocumentStorageService | undefined | null,
        public readonly loader: ILoader,
        private readonly errorFn: (err: any) => void,
        public readonly submitFn: (type: MessageType, contents: any) => number,
        public readonly submitSignalFn: (contents: any) => void,
        public readonly snapshotFn: (message: string) => Promise<void>,
        public readonly closeFn: () => void,
    ) {
        super();
        this._minimumSequenceNumber = attributes.minimumSequenceNumber;
        this.logger = container.subLogger;
    }

    public query(id: string): any {
        // Detect updated messaging and mark accordingly
        if (id === "IMessageScheduler") {
            this.legacyMessaging = false;
            return this;
        }

        return ContainerContext.supportedInterfaces.indexOf(id) !== -1 ? this : undefined;
    }

    public list(): string[] {
        return ContainerContext.supportedInterfaces;
    }

    public async snapshot(tagMessage: string, generateFullTreeNoOptimizations?: boolean): Promise<ITree | null> {
        return this.runtime!.snapshot(tagMessage, generateFullTreeNoOptimizations);
    }

    public summarize(generateFullTreeNoOptimizations?: boolean): Promise<ISummaryTree> {
        if (!this.canSummarize) {
            return Promise.reject("Runtime does not support summaries");
        }

        return this.runtime!.summarize(generateFullTreeNoOptimizations);
    }

    public changeConnectionState(value: ConnectionState, clientId: string, version?: string) {
        this.runtime!.changeConnectionState(value, clientId, version);
        raiseConnectedEvent(this, value, clientId);
    }

    public async stop(): Promise<ITree | null> {
        const snapshot = await this.runtime!.snapshot("", false /*generageFullTreeNoOptimizations*/);
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
        return this.snapshotFn(tagMessage);
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
