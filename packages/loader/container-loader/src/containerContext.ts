/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IComponent,
    IComponentConfiguration,
    IRequest,
    IResponse,
} from "@microsoft/fluid-component-core-interfaces";
import {
    ConnectionState,
    IAudience,
    ICodeLoader,
    IContainerContext,
    IDeltaManager,
    ILoader,
    IQuorum,
    IRuntime,
    IRuntimeFactory,
    ITelemetryLogger,
} from "@microsoft/fluid-container-definitions";
import { raiseConnectedEvent } from "@microsoft/fluid-core-utils";
import {
    IDocumentAttributes,
    IDocumentMessage,
    IDocumentStorageService,
    ISequencedDocumentMessage,
    IServiceConfiguration,
    ISignalMessage,
    ISnapshotTree,
    ITree,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
import { EventEmitter } from "events";
import { BlobManager } from "./blobManager";
import { Container } from "./container";

export class ContainerContext extends EventEmitter implements IContainerContext {
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
        errorFn: (err: any) => void,
        submitFn: (type: MessageType, contents: any, batch: boolean, appData: any) => number,
        submitSignalFn: (contents: any) => void,
        snapshotFn: (message: string) => Promise<void>,
        closeFn: () => void,                        // When would the context ever close?
        version: string,
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
            version);
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

    // tslint:disable-next-line:no-unsafe-any
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
        this.legacyMessaging = false;
        return this;
    }

    public get baseSnapshot() {
        return this._baseSnapshot;
    }

    // Back compat flag - can remove in 0.6
    public legacyMessaging = true;

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
        public readonly storage: IDocumentStorageService | undefined | null,
        public readonly loader: ILoader,
        private readonly errorFn: (err: any) => void,
        // tslint:disable-next-line:max-line-length
        public readonly submitFn: (type: MessageType, contents: any, batch: boolean, appData: any) => number,
        public readonly submitSignalFn: (contents: any) => void,
        public readonly snapshotFn: (message: string) => Promise<void>,
        public readonly closeFn: () => void,
        public readonly version: string,
    ) {
        super();
        this.logger = container.subLogger;
    }

    public refreshBaseSnapshot(snapshot: ISnapshotTree) {
        this._baseSnapshot = snapshot;
        // need to notify runtime of the update
        this.emit("refreshBaseSnapshot", snapshot);
    }

    public async snapshot(tagMessage: string, fullTree: boolean = false): Promise<ITree | null> {
        return this.runtime!.snapshot(tagMessage, fullTree);
    }

    public changeConnectionState(value: ConnectionState, clientId: string, version?: string) {
        this.runtime!.changeConnectionState(value, clientId, version);
        raiseConnectedEvent(this, value, clientId);
    }

    public async stop(): Promise<ITree | null> {
        const snapshot = await this.runtime!.snapshot("", false);
        await this.runtime!.stop();

        // dispose
        this.quorum.dispose();
        this.deltaManager.dispose();

        return snapshot;
    }

    public async prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        // included for back compat with documents created prior to prepare deprecation
        if (!this.runtime || !this.runtime.prepare) {
            return Promise.reject("Runtime must query for IMessageHandler to signal it does not implement prepare");
        }

        this.runtime.prepare(message, local);
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any) {
        this.runtime!.process(message, local, context);
    }

    public async postProcess(message: ISequencedDocumentMessage, local: boolean, context: any): Promise<void> {
        // included for back compat with documents created prior to postProcess deprecation
        if (!this.runtime || !this.runtime.postProcess) {
            return Promise.reject("Runtime must query for IMessageHandler to signal it does not implement postProcess");
        }

        return this.runtime.postProcess(message, local, context);
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

    public reloadContext() {
        this.container.reloadContext();
    }

    private async load() {
        this.runtime = await this.chaincode.instantiateRuntime(this);
    }
}
