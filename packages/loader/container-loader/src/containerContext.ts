/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    IComponent,
    IComponentConfiguration,
    IRequest,
    IResponse,
} from "@fluidframework/component-core-interfaces";
import {
    IAudience,
    ICodeLoader,
    IContainerContext,
    IDeltaManager,
    ILoader,
    IRuntime,
    IRuntimeFactory,
    IRuntimeState,
} from "@fluidframework/container-definitions";
import { IDocumentStorageService, IError } from "@fluidframework/driver-definitions";
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
    IVersion,
} from "@fluidframework/protocol-definitions";
import { BlobManager } from "./blobManager";
import { Container } from "./container";
import { NullRuntime } from "./nullRuntime";

export class ContainerContext implements IContainerContext {
    public readonly isExperimentalContainerContext = true;
    public static async createOrLoad(
        container: Container,
        scope: IComponent,
        codeLoader: ICodeLoader,
        runtimeFactory: IRuntimeFactory,
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
        closeFn: (error?: IError) => void,
        version: string,
        previousRuntimeState: IRuntimeState,
    ): Promise<ContainerContext> {
        const context = new ContainerContext(
            container,
            scope,
            codeLoader,
            runtimeFactory,
            baseSnapshot,
            attributes,
            blobManager,
            deltaManager,
            quorum,
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

    public get parentBranch(): string | null {
        return this.container.parentBranch;
    }

    // Back-compat: supporting <= 0.16 components
    public get connectionState(): ConnectionState {
        return this.connected ? ConnectionState.Connected : ConnectionState.Disconnected;
    }

    public get connected(): boolean {
        return this.container.connected;
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
        return this.container.storage;
    }

    private runtime: IRuntime | undefined;

    private _disposed = false;
    public get disposed() {
        return this._disposed;
    }

    constructor(
        private readonly container: Container,
        public readonly scope: IComponent,
        public readonly codeLoader: ICodeLoader,
        public readonly runtimeFactory: IRuntimeFactory,
        private readonly _baseSnapshot: ISnapshotTree | null,
        private readonly attributes: IDocumentAttributes,
        public readonly blobManager: BlobManager | undefined,
        public readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        public readonly quorum: IQuorum,
        public readonly loader: ILoader,
        private readonly errorFn: (err: IError) => void,
        public readonly submitFn: (type: MessageType, contents: any, batch: boolean, appData: any) => number,
        public readonly submitSignalFn: (contents: any) => void,
        public readonly snapshotFn: (message: string) => Promise<void>,
        public readonly closeFn: (error?: IError) => void,
        public readonly version: string,
        public readonly previousRuntimeState: IRuntimeState,
    ) {
        this.logger = container.subLogger;
    }

    public dispose(error?: Error): void {
        if (this._disposed) {
            return;
        }
        this._disposed = true;

        this.runtime!.dispose(error);
        this.quorum.dispose();
        this.deltaManager.dispose();
    }

    public async snapshot(tagMessage: string = "", fullTree: boolean = false): Promise<ITree | null> {
        return this.runtime!.snapshot(tagMessage, fullTree);
    }

    public getLoadedFromVersion(): IVersion | undefined {
        return this.container.loadedFromVersion;
    }

    /**
     * Snapshot and close the runtime, and return its state if available
     */
    public async snapshotRuntimeState(): Promise<IRuntimeState> {
        return this.runtime!.stop();
    }

    public isLocal(): boolean {
        return this.container.isLocal();
    }

    public createSummary(): ISummaryTree {
        if (!this.runtime) {
            throw new Error("Runtime should be there to take summary");
        }
        return this.runtime.createSummary();
    }

    public setConnectionState(connected: boolean, clientId?: string) {
        const runtime = this.runtime!;

        assert(this.connected === connected);

        // Back-compat: supporting <= 0.16 components
        if (runtime.setConnectionState) {
            runtime.setConnectionState(connected, clientId);
        } else if (runtime.changeConnectionState) {
            runtime.changeConnectionState(this.connectionState, clientId);
        } else {
            assert(false);
        }
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

    public hasNullRuntime() {
        return this.runtime! instanceof NullRuntime;
    }

    public async getAbsoluteUrl?(relativeUrl: string): Promise<string> {
        return this.container.getAbsoluteUrl(relativeUrl);
    }

    private async load() {
        this.runtime = await this.runtimeFactory.instantiateRuntime(this);
    }
}
