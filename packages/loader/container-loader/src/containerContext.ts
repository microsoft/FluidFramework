/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { ITelemetryLogger } from "@microsoft/fluid-common-definitions";
import {
    IComponent,
    IComponentConfiguration,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import {
    IAudience,
    ICodeLoader,
    IContainerContext,
    IDeltaManager,
    ILoader,
    IRuntime,
    IRuntimeFactory,
    IRuntimeState,
    IExperimentalRuntime,
    IExperimentalContainerContext,
} from "@microsoft/fluid-container-definitions";
import { IDocumentStorageService, IError } from "@microsoft/fluid-driver-definitions";
import { raiseConnectedEvent } from "@microsoft/fluid-protocol-base";
import {
    ConnectionState,
    IClientDetails,
    IDocumentAttributes,
    IDocumentMessage,
    IQuorum,
    ISequencedDocumentMessage,
    IServiceConfiguration,
    ISignalMessage,
    ISnapshotTree,
    ITree,
    MessageType,
    ISummaryTree,
} from "@microsoft/fluid-protocol-definitions";
import { BlobManager } from "./blobManager";
import { Container } from "./container";

export class ContainerContext extends EventEmitter implements IContainerContext, IExperimentalContainerContext {

    public readonly isExperimentalContainerContext = true;
    public static async load(
        container: Container,
        scope: IComponent,
        codeLoader: ICodeLoader,
        chaincode: IRuntimeFactory,
        baseSnapshot: ISnapshotTree | null,
        attributes: IDocumentAttributes,
        blobManager: BlobManager | undefined,
        deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        quorum: IQuorum,
        loader: ILoader,
        storage: IDocumentStorageService | null | undefined,
        errorFn: (err: IError) => void,
        submitFn: (type: MessageType, contents: any, batch: boolean, appData: any) => number,
        submitSignalFn: (contents: any) => void,
        snapshotFn: (message: string) => Promise<void>,
        closeFn: (reason?: string) => void,
        version: string,
        previousRuntimeState: IRuntimeState,
    ): Promise<ContainerContext> {
        const context = new ContainerContext(
            container,
            scope,
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
            closeFn,
            version,
            previousRuntimeState);
        await context.load();
        return context;
    }

    public static async create(
        container: Container,
        scope: IComponent,
        codeLoader: ICodeLoader,
        chaincode: IRuntimeFactory,
        baseSnapshot: ISnapshotTree | null,
        attributes: IDocumentAttributes,
        blobManager: BlobManager | undefined,
        deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        quorum: IQuorum,
        loader: ILoader,
        errorFn: (err: IError) => void,
        submitFn: (type: MessageType, contents: any, batch: boolean, appData: any) => number,
        submitSignalFn: (contents: any) => void,
        snapshotFn: (message: string) => Promise<void>,
        closeFn: (reason?: string) => void,
        version: string,
        previousRuntimeState: IRuntimeState,
    ): Promise<ContainerContext> {
        const context = new ContainerContext(
            container,
            scope,
            codeLoader,
            chaincode,
            baseSnapshot,
            attributes,
            blobManager,
            deltaManager,
            quorum,
            undefined,
            loader,
            errorFn,
            submitFn,
            submitSignalFn,
            snapshotFn,
            closeFn,
            version,
            previousRuntimeState);
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

    public get clientDetails(): IClientDetails {
        return this.container.clientDetails;
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

    public get connectionState(): ConnectionState {
        return this.container.connectionState;
    }

    public get connected(): boolean {
        return this.connectionState === ConnectionState.Connected;
    }

    public get canSummarize(): boolean {
        return "summarize" in this.runtime!;
    }

    public get serviceConfiguration(): IServiceConfiguration | undefined {
        return this.container.serviceConfiguration;
    }

    public get audience(): IAudience {
        return this.container.audience;
    }

    public get options(): any {
        return this.container.options;
    }

    public get configuration(): IComponentConfiguration {
        const config: Partial<IComponentConfiguration> = {
            canReconnect: this.container.canReconnect,
            scopes: this.container.scopes,
        };
        return config as IComponentConfiguration;
    }

    public get IMessageScheduler() {
        return this;
    }

    public get baseSnapshot() {
        return this._baseSnapshot;
    }

    public get storage(): IDocumentStorageService | undefined | null {
        return this._storage;
    }

    private runtime: IRuntime | undefined;

    constructor(
        private readonly container: Container,
        public readonly scope: IComponent,
        public readonly codeLoader: ICodeLoader,
        public readonly chaincode: IRuntimeFactory,
        private _baseSnapshot: ISnapshotTree | null,
        private readonly attributes: IDocumentAttributes,
        public readonly blobManager: BlobManager | undefined,
        public readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        public readonly quorum: IQuorum,
        public _storage: IDocumentStorageService | undefined | null,
        public readonly loader: ILoader,
        private readonly errorFn: (err: IError) => void,
        public readonly submitFn: (type: MessageType, contents: any, batch: boolean, appData: any) => number,
        public readonly submitSignalFn: (contents: any) => void,
        public readonly snapshotFn: (message: string) => Promise<void>,
        public readonly closeFn: () => void,
        public readonly version: string,
        public readonly previousRuntimeState: IRuntimeState,
    ) {
        super();
        this.logger = container.subLogger;
    }

    /**
     * DEPRECATED
     * back-compat: 0.13 refreshBaseSummary
     */
    public refreshBaseSummary(snapshot: ISnapshotTree) {
        this._baseSnapshot = snapshot;
        // Need to notify runtime of the update
        this.emit("refreshBaseSummary", snapshot);
    }

    public async snapshot(tagMessage: string, fullTree: boolean = false): Promise<ITree | null> {
        return this.runtime!.snapshot(tagMessage, fullTree);
    }

    public isAttached(): boolean {
        return this.container.isAttached();
    }

    public async attachAndSummarize(): Promise<ISummaryTree> {
        const tree = await (this.runtime! as IExperimentalRuntime).attachAndSummarize();
        return tree;
    }

    public attachServices(storage: IDocumentStorageService): void {
        this._storage = storage;
    }

    public changeConnectionState(value: ConnectionState, clientId: string, version?: string) {
        this.runtime!.changeConnectionState(value, clientId, version);
        raiseConnectedEvent(this, value, clientId);
    }

    public async stop(): Promise<IRuntimeState> {
        let state = await this.runtime!.stop();
        // back-compat: 0.14 runtimeState
        if (!state) {
            state = { snapshot: await this.runtime!.snapshot("", false) ?? undefined };
        }

        // Dispose
        this.quorum.dispose();
        this.deltaManager.dispose();

        return state;
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any) {
        this.runtime!.process(message, local, context);
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

    public error(err: IError): void {
        this.errorFn(err);
    }

    public registerTasks(tasks: string[]): any {
        return;
    }

    public async reloadContext(): Promise<void> {
        return this.container.reloadContext();
    }

    private async load() {
        this.runtime = await this.chaincode.instantiateRuntime(this);
    }
}
