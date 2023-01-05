/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { LazyPromise } from "@fluidframework/common-utils";
import {
    IAudience,
    IContainerContext,
    IDeltaManager,
    ILoader,
    IRuntime,
    ICriticalContainerError,
    AttachState,
    ILoaderOptions,
    IRuntimeFactory,
    IProvideRuntimeFactory,
    IFluidCodeDetails,
    IFluidCodeDetailsComparer,
    IProvideFluidCodeDetailsComparer,
    ICodeDetailsLoader,
    IFluidModuleWithDetails,
    ISnapshotTreeWithBlobContents,
    IBatchMessage,
} from "@fluidframework/container-definitions";
import {
    IRequest,
    IResponse,
    FluidObject,
} from "@fluidframework/core-interfaces";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { isFluidResolvedUrl } from "@fluidframework/driver-utils";
import {
    IClientConfiguration,
    IClientDetails,
    IDocumentMessage,
    IQuorum,
    IQuorumClients,
    ISequencedDocumentMessage,
    ISignalMessage,
    ISnapshotTree,
    ISummaryTree,
    IVersion,
    MessageType,
    ISummaryContent,
} from "@fluidframework/protocol-definitions";
import { PerformanceEvent } from "@fluidframework/telemetry-utils";
import { Container, ReportIfTooLong } from "./container";

const PackageNotFactoryError = "Code package does not implement IRuntimeFactory";

export class ContainerContext implements IContainerContext {
    public static async createOrLoad(
        container: Container,
        scope: FluidObject,
        codeLoader: ICodeDetailsLoader,
        codeDetails: IFluidCodeDetails,
        baseSnapshot: ISnapshotTree | undefined,
        deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        quorum: IQuorum,
        loader: ILoader,
        submitFn: (type: MessageType, contents: any, batch: boolean, appData: any) => number,
        submitSummaryFn: (summaryOp: ISummaryContent) => number,
        submitBatchFn: (batch: IBatchMessage[]) => number,
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
            submitFn,
            submitSummaryFn,
            submitBatchFn,
            submitSignalFn,
            closeFn,
            version,
            updateDirtyContainerState,
            existing,
            pendingLocalState);
        await context.instantiateRuntime(existing);
        return context;
    }

    public readonly taggedLogger: ITelemetryLogger;

    public get clientId(): string | undefined {
        return this.container.clientId;
    }

    /**
     * DISCLAIMER: this id is only for telemetry purposes. Not suitable for any other usages.
     */
    public get id(): string {
        const resolvedUrl = this.container.resolvedUrl;
        if (isFluidResolvedUrl(resolvedUrl)) {
            return resolvedUrl.id;
        }
        return "";
    }

    public get clientDetails(): IClientDetails {
        return this.container.clientDetails;
    }

    private _connected: boolean;
    /**
     * When true, ops are free to flow
     * When false, ops should be kept as pending or rejected
     */
    public get connected(): boolean {
        return this._connected;
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

    private readonly _quorum: IQuorum;
    public get quorum(): IQuorumClients { return this._quorum; }

    private readonly _fluidModuleP: Promise<IFluidModuleWithDetails>;

    constructor(
        private readonly container: Container,
        public readonly scope: FluidObject,
        private readonly codeLoader: ICodeDetailsLoader,
        private readonly _codeDetails: IFluidCodeDetails,
        private _baseSnapshot: ISnapshotTree | undefined,
        public readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        quorum: IQuorum,
        public readonly loader: ILoader,
        public readonly submitFn: (type: MessageType, contents: any, batch: boolean, appData: any) => number,
        public readonly submitSummaryFn: (summaryOp: ISummaryContent) => number,
        /** @returns clientSequenceNumber of last message in a batch */
        public readonly submitBatchFn: (batch: IBatchMessage[]) => number,
        public readonly submitSignalFn: (contents: any) => void,
        public readonly closeFn: (error?: ICriticalContainerError) => void,
        public readonly version: string,
        public readonly updateDirtyContainerState: (dirty: boolean) => void,
        public readonly existing: boolean,
        public readonly pendingLocalState?: unknown,

    ) {
        this._connected = this.container.connected;
        this._quorum = quorum;
        this.taggedLogger = container.subLogger;
        this._fluidModuleP = new LazyPromise<IFluidModuleWithDetails>(
            async () => this.loadCodeModule(_codeDetails),
        );
        this.attachListener();
    }

    /**
     * @deprecated Temporary migratory API, to be removed when customers no longer need it.
     * When removed, `ContainerContext` should only take an {@link @fluidframework/container-definitions#IQuorumClients}
     * rather than an {@link @fluidframework/protocol-definitions#IQuorum}.
     * See {@link @fluidframework/container-definitions#IContainerContext} for more details.
     */
    public getSpecifiedCodeDetails(): IFluidCodeDetails | undefined {
        return (this._quorum.get("code") ?? this._quorum.get("code2")) as IFluidCodeDetails | undefined;
    }

    public dispose(error?: Error): void {
        if (this._disposed) {
            return;
        }
        this._disposed = true;

        this.runtime.dispose(error);
        this._quorum.dispose();
        this.deltaManager.dispose();
    }

    public getLoadedFromVersion(): IVersion | undefined {
        return this.container.loadedFromVersion;
    }

    public get attachState(): AttachState {
        return this.container.attachState;
    }

    /**
     * Create a summary. Used when attaching or serializing a detached container.
     *
     * @param blobRedirectTable - A table passed during the attach process. While detached, blob upload is supported
     * using IDs generated locally. After attach, these IDs cannot be used, so this table maps the old local IDs to the
     * new storage IDs so requests can be redirected.
     */
    public createSummary(blobRedirectTable?: Map<string, string>): ISummaryTree {
        return this.runtime.createSummary(blobRedirectTable);
    }

    public setConnectionState(connected: boolean, clientId?: string) {
        const runtime = this.runtime;
        this._connected = connected;
        runtime.setConnectionState(connected, clientId);
    }

    public process(message: ISequencedDocumentMessage, local: boolean) {
        this.runtime.process(message, local);
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
        const maybeCompareExport: Partial<IProvideFluidCodeDetailsComparer> | undefined =
            moduleWithDetails.module?.fluidExport;
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

    public notifyAttaching(snapshot: ISnapshotTreeWithBlobContents) {
        this._baseSnapshot = snapshot;
        this.runtime.notifyAttaching?.(snapshot);
        this.runtime.setAttachState(AttachState.Attaching);
    }

    // #region private

    private async getRuntimeFactory(): Promise<IRuntimeFactory> {
        const fluidExport: FluidObject<IProvideRuntimeFactory> | undefined =
            (await this._fluidModuleP).module?.fluidExport;
        const runtimeFactory = fluidExport?.IRuntimeFactory;
        if (runtimeFactory === undefined) {
            throw new Error(PackageNotFactoryError);
        }

        return runtimeFactory;
    }

    private async instantiateRuntime(existing: boolean) {
        const runtimeFactory = await this.getRuntimeFactory();
        await ReportIfTooLong(
            this.taggedLogger,
            "instantiateRuntime",
            async () => {
                this._runtime = await runtimeFactory.instantiateRuntime(this, existing);
                return {};
            });
    }

    private attachListener() {
        this.container.once("attached", () => {
            this.runtime.setAttachState(AttachState.Attached);
        });
    }

    private async loadCodeModule(codeDetails: IFluidCodeDetails): Promise<IFluidModuleWithDetails> {
        const loadCodeResult = await PerformanceEvent.timedExecAsync(
            this.taggedLogger,
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
            // If "module" is not in the result, we are using a legacy ICodeLoader.  Fix the result up with details.
            // Once usage drops to 0 we can remove this compat path.
            this.taggedLogger.sendTelemetryEvent({ eventName: "LegacyCodeLoader" });
            return loadCodeResult;
        }
    }
    // #endregion
}
