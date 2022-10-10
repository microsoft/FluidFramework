/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    FluidObject,
    IRequest,
    IResponse,
    IFluidHandle,
} from "@fluidframework/core-interfaces";
import {
    IAudience,
    IDeltaManager,
    AttachState,
    ILoaderOptions,
} from "@fluidframework/container-definitions";
import {
    assert,
    Deferred,
    LazyPromise,
    TypedEventEmitter,
} from "@fluidframework/common-utils";
import { IDocumentStorageService } from "@fluidframework/driver-definitions";
import { readAndParse } from "@fluidframework/driver-utils";
import { BlobTreeEntry } from "@fluidframework/protocol-base";
import {
    IClientDetails,
    IDocumentMessage,
    IQuorumClients,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITreeEntry,
} from "@fluidframework/protocol-definitions";
import {
    IContainerRuntime,
} from "@fluidframework/container-runtime-definitions";
import {
    BindState,
    channelsTreeName,
    CreateChildSummarizerNodeFn,
    CreateChildSummarizerNodeParam,
    FluidDataStoreRegistryEntry,
    IAttachMessage,
    IFluidDataStoreChannel,
    IFluidDataStoreContext,
    IFluidDataStoreContextDetached,
    IFluidDataStoreContextEvents,
    IFluidDataStoreRegistry,
    IGarbageCollectionData,
    IGarbageCollectionDetailsBase,
    IInboundSignalMessage,
    IProvideFluidDataStoreFactory,
    ISummarizeInternalResult,
    ISummarizeResult,
    ISummarizerNodeWithGC,
    SummarizeInternalFn,
    ITelemetryContext,
} from "@fluidframework/runtime-definitions";
import { addBlobToSummary, convertSummaryTreeToITree } from "@fluidframework/runtime-utils";
import {
    ChildLogger,
    LoggingError,
    TelemetryDataTag,
    ThresholdCounter,
} from "@fluidframework/telemetry-utils";
import { DataProcessingError } from "@fluidframework/container-utils";

import { ContainerRuntime } from "./containerRuntime";
import {
    dataStoreAttributesBlobName,
    hasIsolatedChannels,
    wrapSummaryInChannelsTree,
    ReadFluidDataStoreAttributes,
    WriteFluidDataStoreAttributes,
    getAttributesFormatVersion,
    getFluidDataStoreAttributes,
} from "./summaryFormat";

function createAttributes(
    pkg: readonly string[],
    isRootDataStore: boolean,
): WriteFluidDataStoreAttributes {
    const stringifiedPkg = JSON.stringify(pkg);
    return {
        pkg: stringifiedPkg,
        summaryFormatVersion: 2,
        isRootDataStore,
    };
}
export function createAttributesBlob(
    pkg: readonly string[],
    isRootDataStore: boolean,
): ITreeEntry {
    const attributes = createAttributes(pkg, isRootDataStore);
    return new BlobTreeEntry(dataStoreAttributesBlobName, JSON.stringify(attributes));
}

interface ISnapshotDetails {
    pkg: readonly string[];
    isRootDataStore: boolean;
    snapshot?: ISnapshotTree;
}

interface FluidDataStoreMessage {
    content: any;
    type: string;
}

/** Properties necessary for creating a FluidDataStoreContext */
export interface IFluidDataStoreContextProps {
    readonly id: string;
    readonly runtime: ContainerRuntime;
    readonly storage: IDocumentStorageService;
    readonly scope: FluidObject;
    readonly createSummarizerNodeFn: CreateChildSummarizerNodeFn;
    readonly pkg?: Readonly<string[]>;
}

/** Properties necessary for creating a local FluidDataStoreContext */
export interface ILocalFluidDataStoreContextProps extends IFluidDataStoreContextProps {
    readonly pkg: Readonly<string[]> | undefined;
    readonly snapshotTree: ISnapshotTree | undefined;
    readonly isRootDataStore: boolean | undefined;
    readonly makeLocallyVisibleFn: () => void;
    /**
     * @deprecated 0.16 Issue #1635, #3631
     */
    readonly createProps?: any;
}

/** Properties necessary for creating a remote FluidDataStoreContext */
export interface IRemoteFluidDataStoreContextProps extends IFluidDataStoreContextProps {
    readonly snapshotTree: ISnapshotTree | undefined;
    readonly getBaseGCDetails: () => Promise<IGarbageCollectionDetailsBase | undefined>;
}

/**
 * Represents the context for the store. This context is passed to the store runtime.
 */
export abstract class FluidDataStoreContext extends TypedEventEmitter<IFluidDataStoreContextEvents> implements
    IFluidDataStoreContext,
    IDisposable {
    public get packagePath(): readonly string[] {
        assert(this.pkg !== undefined, 0x139 /* "Undefined package path" */);
        return this.pkg;
    }

    public get options(): ILoaderOptions {
        return this._containerRuntime.options;
    }

    public get clientId(): string | undefined {
        return this._containerRuntime.clientId;
    }

    public get clientDetails(): IClientDetails {
        return this._containerRuntime.clientDetails;
    }

    public get logger(): ITelemetryLogger {
        return this._containerRuntime.logger;
    }

    public get deltaManager(): IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
        return this._containerRuntime.deltaManager;
    }

    public get connected(): boolean {
        return this._containerRuntime.connected;
    }

    public get IFluidHandleContext() {
        return this._containerRuntime.IFluidHandleContext;
    }

    public get containerRuntime(): IContainerRuntime {
        return this._containerRuntime;
    }

    public get isLoaded(): boolean {
        return this.loaded;
    }

    public get baseSnapshot(): ISnapshotTree | undefined {
        return this._baseSnapshot;
    }

    private _disposed = false;
    public get disposed() { return this._disposed; }

    public get attachState(): AttachState {
        return this._attachState;
    }

    public get IFluidDataStoreRegistry(): IFluidDataStoreRegistry | undefined {
        return this.registry;
    }

    /**
     * A datastore is considered as root if it
     * 1. is root in memory - see isInMemoryRoot
     * 2. is root as part of the base snapshot that the datastore loaded from
     * @returns whether a datastore is root
     */
    public async isRoot(): Promise<boolean> {
        return this.isInMemoryRoot() || (await this.getInitialSnapshotDetails()).isRootDataStore;
    }

    /**
     * There are 3 states where isInMemoryRoot needs to be true
     * 1. when a datastore becomes aliased. This can happen for both remote and local datastores
     * 2. when a datastore is created locally as root
     * 3. when a datastore is created locally as root and is rehydrated
     * @returns whether a datastore is root in memory
     */
    protected isInMemoryRoot(): boolean {
        return this._isInMemoryRoot;
    }

    protected registry: IFluidDataStoreRegistry | undefined;

    protected detachedRuntimeCreation = false;
    /** @deprecated - To be replaced by calling makeLocallyVisible directly  */
    public readonly bindToContext: () => void;
    protected channel: IFluidDataStoreChannel | undefined;
    private loaded = false;
    protected pending: ISequencedDocumentMessage[] | undefined = [];
    protected channelDeferred: Deferred<IFluidDataStoreChannel> | undefined;
    private _baseSnapshot: ISnapshotTree | undefined;
    protected _attachState: AttachState;
    private _isInMemoryRoot: boolean = false;
    protected readonly summarizerNode: ISummarizerNodeWithGC;
    private readonly subLogger: ITelemetryLogger;
    private readonly thresholdOpsCounter: ThresholdCounter;
    private static readonly pendingOpsCountThreshold = 1000;

    // The used routes of this node as per the last GC run. This is used to update the used routes of the channel
    // if it realizes after GC is run.
    private lastUsedRoutes: string[] | undefined;

    public readonly id: string;
    private readonly _containerRuntime: ContainerRuntime;
    public readonly storage: IDocumentStorageService;
    public readonly scope: FluidObject;
    protected pkg?: readonly string[];

    constructor(
        props: IFluidDataStoreContextProps,
        private readonly existing: boolean,
        private bindState: BindState,  // Used to assert for state tracking purposes
        public readonly isLocalDataStore: boolean,
        private readonly makeLocallyVisibleFn: () => void,
    ) {
        super();

        this._containerRuntime = props.runtime;
        this.id = props.id;
        this.storage = props.storage;
        this.scope = props.scope;
        this.pkg = props.pkg;

        // URIs use slashes as delimiters. Handles use URIs.
        // Thus having slashes in types almost guarantees trouble down the road!
        assert(!this.id.includes("/"), 0x13a /* Data store ID contains slash */);

        this._attachState = this.containerRuntime.attachState !== AttachState.Detached && this.existing ?
            this.containerRuntime.attachState : AttachState.Detached;

        this.bindToContext = () => {
            assert(this.bindState === BindState.NotBound, 0x13b /* "datastore context is already in bound state" */);
            this.bindState = BindState.Binding;
            assert(this.channel !== undefined, 0x13c /* "undefined channel on datastore context" */);
            this.makeLocallyVisible();
            this.bindState = BindState.Bound;
        };

        const thisSummarizeInternal =
            async (fullTree: boolean, trackState: boolean, telemetryContext?: ITelemetryContext) =>
            this.summarizeInternal(fullTree, trackState, telemetryContext);

        this.summarizerNode = props.createSummarizerNodeFn(
            thisSummarizeInternal,
            async (fullGC?: boolean) => this.getGCDataInternal(fullGC),
            async () => this.getBaseGCDetails(),
        );

        this.subLogger = ChildLogger.create(this.logger, "FluidDataStoreContext");
        this.thresholdOpsCounter = new ThresholdCounter(FluidDataStoreContext.pendingOpsCountThreshold, this.subLogger);
    }

    public dispose(): void {
        if (this._disposed) {
            return;
        }
        this._disposed = true;

        // Dispose any pending runtime after it gets fulfilled
        // Errors are logged where this.channelDeferred is consumed/generated (realizeCore(), bindRuntime())
        if (this.channelDeferred) {
            this.channelDeferred.promise.then((runtime) => {
                runtime.dispose();
            }).catch((error) => {});
        }
    }

    private rejectDeferredRealize(reason: string, packageName?: string): never {
        throw new LoggingError(reason, { packageName: { value: packageName, tag: TelemetryDataTag.CodeArtifact } });
    }

    public async realize(): Promise<IFluidDataStoreChannel> {
        assert(!this.detachedRuntimeCreation, 0x13d /* "Detached runtime creation on realize()" */);
        if (!this.channelDeferred) {
            this.channelDeferred = new Deferred<IFluidDataStoreChannel>();
            this.realizeCore(this.existing).catch((error) => {
                const errorWrapped = DataProcessingError.wrapIfUnrecognized(error, "realizeFluidDataStoreContext");
                errorWrapped.addTelemetryProperties({
                    fluidDataStoreId: {
                        value: this.id,
                        tag: TelemetryDataTag.CodeArtifact,
                    },
                });
                this.channelDeferred?.reject(errorWrapped);
                this.logger.sendErrorEvent({ eventName: "RealizeError" }, errorWrapped);
            });
        }
        return this.channelDeferred.promise;
    }

    protected async factoryFromPackagePath(packages?: readonly string[]) {
        assert(this.pkg === packages, 0x13e /* "Unexpected package path" */);
        if (packages === undefined) {
            this.rejectDeferredRealize("packages is undefined");
        }

        let entry: FluidDataStoreRegistryEntry | undefined;
        let registry: IFluidDataStoreRegistry | undefined = this._containerRuntime.IFluidDataStoreRegistry;
        let lastPkg: string | undefined;
        for (const pkg of packages) {
            if (!registry) {
                this.rejectDeferredRealize("No registry for package", lastPkg);
            }
            lastPkg = pkg;
            entry = await registry.get(pkg);
            if (!entry) {
                this.rejectDeferredRealize("Registry does not contain entry for the package", pkg);
            }
            registry = entry.IFluidDataStoreRegistry;
        }
        const factory = entry?.IFluidDataStoreFactory;
        if (factory === undefined) {
            this.rejectDeferredRealize("Can't find factory for package", lastPkg);
        }

        return { factory, registry };
    }

    private async realizeCore(existing: boolean): Promise<void> {
        const details = await this.getInitialSnapshotDetails();
        // Base snapshot is the baseline where pending ops are applied to.
        // It is important that this be in sync with the pending ops, and also
        // that it is set here, before bindRuntime is called.
        this._baseSnapshot = details.snapshot;
        const packages = details.pkg;

        const { factory, registry } = await this.factoryFromPackagePath(packages);

        assert(this.registry === undefined, 0x13f /* "datastore context registry is already set" */);
        this.registry = registry;

        const channel = await factory.instantiateDataStore(this, existing);
        assert(channel !== undefined, 0x140 /* "undefined channel on datastore context" */);
        this.bindRuntime(channel);
    }

    /**
     * Notifies this object about changes in the connection state.
     * @param value - New connection state.
     * @param clientId - ID of the client. Its old ID when in disconnected state and
     * its new client ID when we are connecting or connected.
     */
    public setConnectionState(connected: boolean, clientId?: string) {
        this.verifyNotClosed();

        // Connection events are ignored if the store is not yet loaded
        if (!this.loaded) {
            return;
        }

        assert(this.connected === connected, 0x141 /* "Unexpected connected state" */);

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.channel!.setConnectionState(connected, clientId);
    }

    public process(messageArg: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown): void {
        this.verifyNotClosed();

        const innerContents = messageArg.contents as FluidDataStoreMessage;
        const message = {
            ...messageArg,
            type: innerContents.type,
            contents: innerContents.content,
        };

        this.summarizerNode.recordChange(message);

        if (this.loaded) {
            return this.channel?.process(message, local, localOpMetadata);
        } else {
            assert(!local, 0x142 /* "local store channel is not loaded" */);
            assert(this.pending !== undefined, 0x23d /* "pending is undefined" */);
            this.pending.push(message);
            this.thresholdOpsCounter.sendIfMultiple("StorePendingOps", this.pending.length);
        }
    }

    public processSignal(message: IInboundSignalMessage, local: boolean): void {
        this.verifyNotClosed();

        // Signals are ignored if the store is not yet loaded
        if (!this.loaded) {
            return;
        }

        this.channel?.processSignal(message, local);
    }

    public getQuorum(): IQuorumClients {
        return this._containerRuntime.getQuorum();
    }

    public getAudience(): IAudience {
        return this._containerRuntime.getAudience();
    }

    /**
     * Returns a summary at the current sequence number.
     * @param fullTree - true to bypass optimizations and force a full summary tree
     * @param trackState - This tells whether we should track state from this summary.
     * @param telemetryContext - summary data passed through the layers for telemetry purposes
     */
    public async summarize(
        fullTree: boolean = false,
        trackState: boolean = true,
        telemetryContext?: ITelemetryContext,
    ): Promise<ISummarizeResult> {
        return this.summarizerNode.summarize(fullTree, trackState, telemetryContext);
    }

    private async summarizeInternal(
        fullTree: boolean,
        trackState: boolean,
        telemetryContext?: ITelemetryContext,
    ): Promise<ISummarizeInternalResult> {
        await this.realize();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const summarizeResult = await this.channel!.summarize(fullTree, trackState, telemetryContext);

        // Wrap dds summaries in .channels subtree.
        wrapSummaryInChannelsTree(summarizeResult);
        const pathPartsForChildren = [channelsTreeName];

        // Add data store's attributes to the summary.
        const { pkg } = await this.getInitialSnapshotDetails();
        const isRoot = await this.isRoot();
        const attributes = createAttributes(pkg, isRoot);
        addBlobToSummary(summarizeResult, dataStoreAttributesBlobName, JSON.stringify(attributes));

        // If we are not referenced, mark the summary tree as unreferenced. Also, update unreferenced blob
        // size in the summary stats with the blobs size of this data store.
        if (!this.summarizerNode.isReferenced()) {
            summarizeResult.summary.unreferenced = true;
            summarizeResult.stats.unreferencedBlobSize = summarizeResult.stats.totalBlobSize;
        }

        return {
            ...summarizeResult,
            id: this.id,
            pathPartsForChildren,
        };
    }

    /**
     * Returns the data used for garbage collection. This includes a list of GC nodes that represent this data store
     * including any of its child channel contexts. Each node has a set of outbound routes to other GC nodes in the
     * document.
     * If there is no new data in this data store since the last summary, previous GC data is used.
     * If there is new data, the GC data is generated again (by calling getGCDataInternal).
     * @param fullGC - true to bypass optimizations and force full generation of GC data.
     */
    public async getGCData(fullGC: boolean = false): Promise<IGarbageCollectionData> {
        return this.summarizerNode.getGCData(fullGC);
    }

    /**
     * Generates data used for garbage collection. This is called when there is new data since last summary. It
     * realizes the data store and calls into each channel context to get its GC data.
     * @param fullGC - true to bypass optimizations and force full generation of GC data.
     */
    private async getGCDataInternal(fullGC: boolean = false): Promise<IGarbageCollectionData> {
        await this.realize();
        assert(this.channel !== undefined, 0x143 /* "Channel should not be undefined when running GC" */);

        return this.channel.getGCData(fullGC);
    }

    /**
     * After GC has run, called to notify the data store of routes used in it. These are used for the following:
     *
     * 1. To identify if this data store is being referenced in the document or not.
     *
     * 2. To determine if it needs to re-summarize in case used routes changed since last summary.
     *
     * 3. These are added to the summary generated by the data store.
     *
     * 4. To notify child contexts of their used routes. This is done immediately if the data store is loaded.
     * Else, it is done when realizing the data store.
     *
     * 5. To update the timestamp when this data store or any children are marked as unreferenced.
     *
     * @param usedRoutes - The routes that are used in this data store.
     */
    public updateUsedRoutes(usedRoutes: string[]) {
        // Update the used routes in this data store's summarizer node.
        this.summarizerNode.updateUsedRoutes(usedRoutes);

        /**
         * Store the used routes to update the channel if the data store is not loaded yet. If the used routes changed
         * since the previous run, the data store will be loaded during summarize since the used state changed. So, it's
         * safe to only store the last used routes.
         */
        this.lastUsedRoutes = usedRoutes;

        // If we are loaded, call the channel so it can update the used routes of the child contexts.
        // If we are not loaded, we will update this when we are realized.
        if (this.loaded) {
            this.updateChannelUsedRoutes();
        }
    }

    /**
     * Called when a new outbound reference is added to another node. This is used by garbage collection to identify
     * all references added in the system.
     * @param srcHandle - The handle of the node that added the reference.
     * @param outboundHandle - The handle of the outbound node that is referenced.
     */
    public addedGCOutboundReference(srcHandle: IFluidHandle, outboundHandle: IFluidHandle) {
        this._containerRuntime.addedGCOutboundReference(srcHandle, outboundHandle);
    }

    /**
     * Updates the used routes of the channel and its child contexts. The channel must be loaded before calling this.
     * It is called in these two scenarios:
     * 1. When the used routes of the data store is updated and the data store is loaded.
     * 2. When the data store is realized. This updates the channel's used routes as per last GC run.
     */
    private updateChannelUsedRoutes() {
        assert(this.loaded, 0x144 /* "Channel should be loaded when updating used routes" */);
        assert(this.channel !== undefined, 0x145 /* "Channel should be present when data store is loaded" */);

        // If there is no lastUsedRoutes, GC has not run up until this point.
        if (this.lastUsedRoutes === undefined) {
            return;
        }

        // Remove the route to this data store, if it exists.
        const usedChannelRoutes = this.lastUsedRoutes.filter(
            (id: string) => { return id !== "/" && id !== ""; },
        );
        this.channel.updateUsedRoutes(usedChannelRoutes);
    }

    /**
     * @deprecated 0.18.Should call request on the runtime directly
     */
    public async request(request: IRequest): Promise<IResponse> {
        const runtime = await this.realize();
        return runtime.request(request);
    }

    public submitMessage(type: string, content: any, localOpMetadata: unknown): void {
        this.verifyNotClosed();
        assert(!!this.channel, 0x146 /* "Channel must exist when submitting message" */);
        const fluidDataStoreContent: FluidDataStoreMessage = {
            content,
            type,
        };
        this._containerRuntime.submitDataStoreOp(
            this.id,
            fluidDataStoreContent,
            localOpMetadata);
    }

    /**
     * This is called from a SharedSummaryBlock that does not generate ops but only wants to be part of the summary.
     * It indicates that there is data in the object that needs to be summarized.
     * We will update the latestSequenceNumber of the summary tracker of this
     * store and of the object's channel.
     *
     * @param address - The address of the channel that is dirty.
     *
     */
    public setChannelDirty(address: string): void {
        this.verifyNotClosed();

        // Get the latest sequence number.
        const latestSequenceNumber = this.deltaManager.lastSequenceNumber;

        this.summarizerNode.invalidate(latestSequenceNumber);

        const channelSummarizerNode = this.summarizerNode.getChild(address);

        if (channelSummarizerNode) {
            channelSummarizerNode.invalidate(latestSequenceNumber); // TODO: lazy load problem?
        }
    }

    public submitSignal(type: string, content: any) {
        this.verifyNotClosed();
        assert(!!this.channel, 0x147 /* "Channel must exist on submitting signal" */);
        return this._containerRuntime.submitDataStoreSignal(this.id, type, content);
    }

    /**
     * This is called by the data store channel when it becomes locally visible indicating that it is ready to become
     * globally visible now.
     */
    public makeLocallyVisible() {
        assert(this.channel !== undefined, 0x2cf /* "undefined channel on datastore context" */);
        this.makeLocallyVisibleFn();
    }

    protected bindRuntime(channel: IFluidDataStoreChannel) {
        if (this.channel) {
            throw new Error("Runtime already bound");
        }

        try {
            assert(!this.detachedRuntimeCreation, 0x148 /* "Detached runtime creation on runtime bind" */);
            assert(this.channelDeferred !== undefined, 0x149 /* "Undefined channel deferral" */);
            assert(this.pkg !== undefined, 0x14a /* "Undefined package path" */);

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const pending = this.pending!;

            // Apply all pending ops
            for (const op of pending) {
                channel.process(op, false, undefined /* localOpMetadata */);
            }

            this.thresholdOpsCounter.send("ProcessPendingOps", pending.length);
            this.pending = undefined;

            // And now mark the runtime active
            this.loaded = true;
            this.channel = channel;

            // Freeze the package path to ensure that someone doesn't modify it when it is
            // returned in packagePath().
            Object.freeze(this.pkg);

            /**
             * Update the used routes of the channel. If GC has run before this data store was realized, we will have
             * the used routes saved. So, this will ensure that all the child contexts have up-to-date used routes as
             * per the last time GC was run.
             * Also, this data store may have been realized during summarize. In that case, the child contexts need to
             * have their used routes updated to determine if its needs to summarize again and to add it to the summary.
             */
            this.updateChannelUsedRoutes();

            // And notify the pending promise it is now available
            this.channelDeferred.resolve(this.channel);
        } catch (error) {
            this.channelDeferred?.reject(error);
            this.logger.sendErrorEvent(
                { eventName: "BindRuntimeError", fluidDataStoreId: {
                    value: this.id,
                    tag: TelemetryDataTag.CodeArtifact,
                } },
                error);
        }
    }

    public async getAbsoluteUrl(relativeUrl: string): Promise<string | undefined> {
        if (this.attachState !== AttachState.Attached) {
            return undefined;
        }
        return this._containerRuntime.getAbsoluteUrl(relativeUrl);
    }

    public abstract generateAttachMessage(): IAttachMessage;

    public abstract getInitialSnapshotDetails(): Promise<ISnapshotDetails>;

    /**
     * @deprecated Sets the datastore as root, for aliasing purposes: #7948
     * This method should not be used outside of the aliasing context.
     * It will be removed, as the source of truth for this flag will be the aliasing blob.
     */
    public setInMemoryRoot(): void {
        this._isInMemoryRoot = true;
    }

    public abstract getBaseGCDetails(): Promise<IGarbageCollectionDetailsBase>;

    public reSubmit(contents: any, localOpMetadata: unknown) {
        assert(!!this.channel, 0x14b /* "Channel must exist when resubmitting ops" */);
        const innerContents = contents as FluidDataStoreMessage;
        this.channel.reSubmit(innerContents.type, innerContents.content, localOpMetadata);
    }

    public rollback(contents: any, localOpMetadata: unknown) {
        if (!this.channel) {
            throw new Error("Channel must exist when rolling back ops");
        }
        if (!this.channel.rollback) {
            throw new Error("Channel doesn't support rollback");
        }
        const innerContents = contents as FluidDataStoreMessage;
        this.channel.rollback(innerContents.type, innerContents.content, localOpMetadata);
    }

    public async applyStashedOp(contents: any): Promise<unknown> {
        if (!this.channel) {
            await this.realize();
        }
        assert(!!this.channel, 0x14c /* "Channel must exist when rebasing ops" */);
        const innerContents = contents as FluidDataStoreMessage;
        return this.channel.applyStashedOp(innerContents.content);
    }

    private verifyNotClosed() {
        if (this._disposed) {
            throw new Error("Context is closed");
        }
    }

    public getCreateChildSummarizerNodeFn(id: string, createParam: CreateChildSummarizerNodeParam) {
        return (
            summarizeInternal: SummarizeInternalFn,
            getGCDataFn: (fullGC?: boolean) => Promise<IGarbageCollectionData>,
            getBaseGCDetailsFn: () => Promise<IGarbageCollectionDetailsBase>,
        ) => this.summarizerNode.createChild(
            summarizeInternal,
            id,
            createParam,
            // DDS will not create failure summaries
            { throwOnFailure: true },
            getGCDataFn,
            getBaseGCDetailsFn,
        );
    }

    public async uploadBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>> {
        return this.containerRuntime.uploadBlob(blob);
    }
}

export class RemoteFluidDataStoreContext extends FluidDataStoreContext {
    private readonly initSnapshotValue: ISnapshotTree | undefined;
    private readonly baseGCDetailsP: Promise<IGarbageCollectionDetailsBase>;

    constructor(props: IRemoteFluidDataStoreContextProps) {
        super(
            props,
            true /* existing */,
            BindState.Bound,
            false /* isLocalDataStore */,
            () => {
                throw new Error("Already attached");
            },
        );

        this.initSnapshotValue = props.snapshotTree;
        this.baseGCDetailsP = new LazyPromise<IGarbageCollectionDetailsBase>(async () => {
            return (await props.getBaseGCDetails()) ?? {};
        });

        if (props.snapshotTree !== undefined) {
            this.summarizerNode.updateBaseSummaryState(props.snapshotTree);
        }
    }

    private readonly initialSnapshotDetailsP = new LazyPromise<ISnapshotDetails>(async () => {
        let tree = this.initSnapshotValue;
        let isRootDataStore = true;

        if (!!tree && tree.blobs[dataStoreAttributesBlobName] !== undefined) {
            // Need to get through snapshot and use that to populate extraBlobs
            const attributes =
                await readAndParse<ReadFluidDataStoreAttributes>(this.storage, tree.blobs[dataStoreAttributesBlobName]);

            let pkgFromSnapshot: string[];
            // Use the snapshotFormatVersion to determine how the pkg is encoded in the snapshot.
            // For snapshotFormatVersion = "0.1" (1) or above, pkg is jsonified, otherwise it is just a string.
            const formatVersion = getAttributesFormatVersion(attributes);
            if (formatVersion < 1) {
                pkgFromSnapshot = attributes.pkg.startsWith("[\"") && attributes.pkg.endsWith("\"]")
                    ? JSON.parse(attributes.pkg) as string[]
                    : [attributes.pkg];
            } else {
                pkgFromSnapshot = JSON.parse(attributes.pkg) as string[];
            }
            this.pkg = pkgFromSnapshot;

            /**
             * If there is no isRootDataStore in the attributes blob, set it to true. This will ensure that
             * data stores in older documents are not garbage collected incorrectly. This may lead to additional
             * roots in the document but they won't break.
             */
            isRootDataStore = attributes.isRootDataStore ?? true;

            if (hasIsolatedChannels(attributes)) {
                tree = tree.trees[channelsTreeName];
                assert(tree !== undefined,
                    0x1fe /* "isolated channels subtree should exist in remote datastore snapshot" */);
            }
        }

        return {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            pkg: this.pkg!,
            isRootDataStore,
            snapshot: tree,
        };
    });

    public async getInitialSnapshotDetails(): Promise<ISnapshotDetails> {
        return this.initialSnapshotDetailsP;
    }

    public async getBaseGCDetails(): Promise<IGarbageCollectionDetailsBase> {
        return this.baseGCDetailsP;
    }

    public generateAttachMessage(): IAttachMessage {
        throw new Error("Cannot attach remote store");
    }
}

/**
 * Base class for detached & attached context classes
 */
export class LocalFluidDataStoreContextBase extends FluidDataStoreContext {
    private readonly snapshotTree: ISnapshotTree | undefined;
    /**
     * @deprecated 0.16 Issue #1635, #3631
     */
    public readonly createProps?: any;

    constructor(props: ILocalFluidDataStoreContextProps) {
        super(
            props,
            props.snapshotTree !== undefined ? true : false /* existing */,
            props.snapshotTree ? BindState.Bound : BindState.NotBound,
            true /* isLocalDataStore */,
            props.makeLocallyVisibleFn,
        );

        this.snapshotTree = props.snapshotTree;
        if (props.isRootDataStore === true) {
            this.setInMemoryRoot();
        }
        this.createProps = props.createProps;
        this.attachListeners();
    }

    private attachListeners(): void {
        this.once("attaching", () => {
            assert(this.attachState === AttachState.Detached, 0x14d /* "Should move from detached to attaching" */);
            this._attachState = AttachState.Attaching;
        });
        this.once("attached", () => {
            assert(this.attachState === AttachState.Attaching, 0x14e /* "Should move from attaching to attached" */);
            this._attachState = AttachState.Attached;
        });
    }

    public generateAttachMessage(): IAttachMessage {
        assert(this.channel !== undefined, 0x14f /* "There should be a channel when generating attach message" */);
        assert(this.pkg !== undefined, 0x150 /* "pkg should be available in local data store context" */);

        const summarizeResult = this.channel.getAttachSummary();

        // Wrap dds summaries in .channels subtree.
        wrapSummaryInChannelsTree(summarizeResult);

        // Add data store's attributes to the summary.
        const attributes = createAttributes(
            this.pkg,
            this.isInMemoryRoot(),
        );
        addBlobToSummary(summarizeResult, dataStoreAttributesBlobName, JSON.stringify(attributes));

        // Attach message needs the summary in ITree format. Convert the ISummaryTree into an ITree.
        const snapshot = convertSummaryTreeToITree(summarizeResult.summary);

        const message: IAttachMessage = {
            id: this.id,
            snapshot,
            type: this.pkg[this.pkg.length - 1],
        };

        return message;
    }

    public async getInitialSnapshotDetails(): Promise<ISnapshotDetails> {
        let snapshot = this.snapshotTree;
        let attributes: ReadFluidDataStoreAttributes;
        let isRootDataStore = false;
        if (snapshot !== undefined) {
            // Get the dataStore attributes.
            // Note: storage can be undefined in special case while detached.
            attributes = await getFluidDataStoreAttributes(this.storage, snapshot);
            if (hasIsolatedChannels(attributes)) {
                snapshot = snapshot.trees[channelsTreeName];
                assert(snapshot !== undefined,
                    0x1ff /* "isolated channels subtree should exist in local datastore snapshot" */);
            }
            if (this.pkg === undefined) {
                this.pkg = JSON.parse(attributes.pkg) as string[];
                // If there is no isRootDataStore in the attributes blob, set it to true. This ensures that data
                // stores in older documents are not garbage collected incorrectly. This may lead to additional
                // roots in the document but they won't break.
                if (attributes.isRootDataStore ?? true) {
                    isRootDataStore = true;
                    this.setInMemoryRoot();
                }
            }
        }
        assert(this.pkg !== undefined, 0x152 /* "pkg should be available in local data store" */);

        return {
            pkg: this.pkg,
            isRootDataStore,
            snapshot,
        };
    }

    public async getBaseGCDetails(): Promise<IGarbageCollectionDetailsBase> {
        // Local data store does not have initial summary.
        return {};
    }
}

/**
 * context implementation for "attached" data store runtime.
 * Various workflows (snapshot creation, requests) result in .realize() being called
 * on context, resulting in instantiation and attachment of runtime.
 * Runtime is created using data store factory that is associated with this context.
 */
export class LocalFluidDataStoreContext extends LocalFluidDataStoreContextBase {
    constructor(props: ILocalFluidDataStoreContextProps) {
        super(props);
    }
}

/**
 * Detached context. Data Store runtime will be attached to it by attachRuntime() call
 * Before attachment happens, this context is not associated with particular type of runtime
 * or factory, i.e. it's package path is undefined.
 * Attachment process provides all missing parts - package path, data store runtime, and data store factory
 */
export class LocalDetachedFluidDataStoreContext
    extends LocalFluidDataStoreContextBase
    implements IFluidDataStoreContextDetached {
    constructor(props: ILocalFluidDataStoreContextProps) {
        super(props);
        this.detachedRuntimeCreation = true;
    }

    public async attachRuntime(
        registry: IProvideFluidDataStoreFactory,
        dataStoreChannel: IFluidDataStoreChannel) {
        assert(this.detachedRuntimeCreation, 0x154 /* "runtime creation is already attached" */);
        this.detachedRuntimeCreation = false;

        assert(this.channelDeferred === undefined, 0x155 /* "channel deferral is already set" */);
        this.channelDeferred = new Deferred<IFluidDataStoreChannel>();

        const factory = registry.IFluidDataStoreFactory;

        const entry = await this.factoryFromPackagePath(this.pkg);
        assert(entry.factory === factory, 0x156 /* "Unexpected factory for package path" */);

        assert(this.registry === undefined, 0x157 /* "datastore registry already attached" */);
        this.registry = entry.registry;

        super.bindRuntime(dataStoreChannel);

        if (await this.isRoot()) {
            dataStoreChannel.makeVisibleAndAttachGraph();
        }
    }

    public async getInitialSnapshotDetails(): Promise<ISnapshotDetails> {
        if (this.detachedRuntimeCreation) {
            throw new Error("Detached Fluid Data Store context can't be realized! Please attach runtime first!");
        }
        return super.getInitialSnapshotDetails();
    }
}
