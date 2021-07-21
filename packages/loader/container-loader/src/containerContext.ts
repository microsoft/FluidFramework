/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    IFluidObject,
    IFluidConfiguration,
    IRequest,
    IResponse,
    IFluidCodeDetails,
    IFluidCodeDetailsComparer,
} from "@fluidframework/core-interfaces";
import {
    IAudience,
    IContainerContext,
    IDeltaManager,
    ILoader,
    IRuntime,
    ICriticalContainerError,
    ContainerWarning,
    AttachState,
    ILoaderOptions,
    IRuntimeFactory,
    ICodeLoader,
} from "@fluidframework/container-definitions";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import {
    IClientConfiguration,
    IClientDetails,
    IDocumentMessage,
    IQuorum,
    ISequencedDocumentMessage,
    ISignalMessage,
    ISnapshotTree,
    ITree,
    MessageType,
    ISummaryTree,
    IVersion,
} from "@fluidframework/protocol-definitions";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { assert, LazyPromise } from "@fluidframework/common-utils";
import { Container } from "./container";
import { ICodeDetailsLoader, IFluidModuleWithDetails } from "./loader";

const PackageNotFactoryError = "Code package does not implement IRuntimeFactory";

export class ContainerContext implements IContainerContext {
    public static async createOrLoad(
        container: Container,
        scope: IFluidObject,
        codeLoader: ICodeDetailsLoader | ICodeLoader,
        codeDetails: IFluidCodeDetails,
        baseSnapshot: ISnapshotTree | undefined,
        deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        quorum: IQuorum,
        loader: ILoader,
        raiseContainerWarning: (warning: ContainerWarning) => void,
        submitFn: (type: MessageType, contents: any, batch: boolean, appData: any) => number,
        submitSignalFn: (contents: any) => void,
        closeFn: (error?: ICriticalContainerError) => void,
        version: string,
        updateDirtyContainerState: (dirty: boolean) => void,
        existing: boolean,
        pendingLocalState?: unknown,
    ): Promise<ContainerContext> {
        const context = new ContainerContext(
            container,
            scope,
            codeLoader,
            codeDetails,
            baseSnapshot,
            deltaManager,
            quorum,
            loader,
            raiseContainerWarning,
            submitFn,
            submitSignalFn,
            closeFn,
            version,
            updateDirtyContainerState,
            existing,
            pendingLocalState);
        await context.instantiateRuntime(existing);
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

    public get connected(): boolean {
        return this.container.connected;
    }

    public get canSummarize(): boolean {
        return "summarize" in this.runtime;
    }

    public get serviceConfiguration(): IClientConfiguration | undefined {
        return this.container.serviceConfiguration;
    }

    public get audience(): IAudience {
        return this.container.audience;
    }

    public get options(): ILoaderOptions {
        return this.container.options;
    }

    public get configuration(): IFluidConfiguration {
        const config: Partial<IFluidConfiguration> = {
            scopes: this.container.scopes,
        };
        return config as IFluidConfiguration;
    }

    public get baseSnapshot() {
        return this._baseSnapshot;
    }

    public get storage(): IDocumentStorageService {
        return this.container.storage;
    }

    private _runtime: IRuntime | undefined;
    private get runtime() {
        if (this._runtime === undefined) {
            throw new Error("Attempted to access runtime before it was defined");
        }
        return this._runtime;
    }

    private _disposed = false;

    public get disposed() {
        return this._disposed;
    }

    public get codeDetails() { return this._codeDetails; }

    private readonly _fluidModuleP: Promise<IFluidModuleWithDetails>;

    constructor(
        private readonly container: Container,
        public readonly scope: IFluidObject,
        private readonly codeLoader: ICodeDetailsLoader | ICodeLoader,
        private readonly _codeDetails: IFluidCodeDetails,
        private readonly _baseSnapshot: ISnapshotTree | undefined,
        public readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        public readonly quorum: IQuorum,
        public readonly loader: ILoader,
        public readonly raiseContainerWarning: (warning: ContainerWarning) => void,
        public readonly submitFn: (type: MessageType, contents: any, batch: boolean, appData: any) => number,
        public readonly submitSignalFn: (contents: any) => void,
        public readonly closeFn: (error?: ICriticalContainerError) => void,
        public readonly version: string,
        public readonly updateDirtyContainerState: (dirty: boolean) => void,
        public readonly existing: boolean,
        public readonly pendingLocalState?: unknown,

    ) {
        this.logger = container.subLogger;
        this._fluidModuleP = new LazyPromise<IFluidModuleWithDetails>(
            async () => this.loadCodeModule(_codeDetails),
        );
        this.attachListener();
    }

    public dispose(error?: Error): void {
        if (this._disposed) {
            return;
        }
        this._disposed = true;

        this.runtime.dispose(error);
        this.quorum.dispose();
        this.deltaManager.dispose();
    }

    public async snapshot(tagMessage: string = "", fullTree: boolean = false): Promise<ITree | null> {
        return this.runtime.snapshot(tagMessage, fullTree);
    }

    public getLoadedFromVersion(): IVersion | undefined {
        return this.container.loadedFromVersion;
    }

    public get attachState(): AttachState {
        return this.container.attachState;
    }

    public createSummary(): ISummaryTree {
        return this.runtime.createSummary();
    }

    public setConnectionState(connected: boolean, clientId?: string) {
        const runtime = this.runtime;

        assert(connected === this.connected, 0x0de /* "Mismatch in connection state while setting" */);

        runtime.setConnectionState(connected, clientId);
    }

    public process(message: ISequencedDocumentMessage, local: boolean, context: any) {
        this.runtime.process(message, local, context);
    }

    public processSignal(message: ISignalMessage, local: boolean) {
        this.runtime.processSignal(message, local);
    }

    public async request(path: IRequest): Promise<IResponse> {
        return this.runtime.request(path);
    }

    public async getAbsoluteUrl(relativeUrl: string): Promise<string | undefined> {
        return this.container.getAbsoluteUrl(relativeUrl);
    }

    public getPendingLocalState(): unknown {
        return this.runtime.getPendingLocalState();
    }

    /**
     * Determines if the current code details of the context
     * satisfy the incoming constraint code details
     */
    public async satisfies(constraintCodeDetails: IFluidCodeDetails) {
        const comparers: IFluidCodeDetailsComparer[] = [];

        const maybeCompareCodeLoader = this.codeLoader;
        if (maybeCompareCodeLoader.IFluidCodeDetailsComparer !== undefined) {
            comparers.push(maybeCompareCodeLoader.IFluidCodeDetailsComparer);
        }

        const moduleWithDetails = await this._fluidModuleP;
        const maybeCompareExport = moduleWithDetails.module?.fluidExport;
        if (maybeCompareExport?.IFluidCodeDetailsComparer !== undefined) {
            comparers.push(maybeCompareExport.IFluidCodeDetailsComparer);
        }

        // if there are not comparers it is not possible to know
        // if the current satisfy the incoming, so return false,
        // as assuming they do not satisfy is safer .e.g we will
        // reload, rather than potentially running with
        // incompatible code
        if (comparers.length === 0) {
            return false;
        }

        for (const comparer of comparers) {
            const satisfies = await comparer.satisfies(
                moduleWithDetails.details,
                constraintCodeDetails,
            );
            if (satisfies === false) {
                return false;
            }
        }
        return true;
    }

    public notifyAttaching() {
        this.runtime.setAttachState(AttachState.Attaching);
    }

    // #region private

    private async getRuntimeFactory(): Promise<IRuntimeFactory> {
        const runtimeFactory = (await this._fluidModuleP).module?.fluidExport?.IRuntimeFactory;
        if (runtimeFactory === undefined) {
            throw new Error(PackageNotFactoryError);
        }

        return runtimeFactory;
    }

    private async instantiateRuntime(existing: boolean) {
        const runtimeFactory = await this.getRuntimeFactory();
        this._runtime = await runtimeFactory.instantiateRuntime(this, existing);
    }

    private attachListener() {
        this.container.once("attached", () => {
            this.runtime.setAttachState(AttachState.Attached);
        });
    }

    private async loadCodeModule(codeDetails: IFluidCodeDetails) {
        const loadCodeResult = await PerformanceEvent.timedExecAsync(
            this.logger,
            { eventName: "CodeLoad" },
            async () => this.codeLoader.load(codeDetails),
        );

        if ("module" in loadCodeResult) {
            const { module, details } = loadCodeResult;
            return {
                module,
                details: details ?? codeDetails,
            };
        } else {
            return { module: loadCodeResult, details: codeDetails };
        }
    }
    // #endregion
}
