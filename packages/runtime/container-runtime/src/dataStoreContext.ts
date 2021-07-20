/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    IFluidObject,
    IRequest,
    IResponse,
    IFluidHandle,
} from "@fluidframework/core-interfaces";
import {
    IAudience,
    IDeltaManager,
    ContainerWarning,
    ILoader,
    BindState,
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
    IQuorum,
    ISequencedDocumentMessage,
    ISnapshotTree,
    ITreeEntry,
} from "@fluidframework/protocol-definitions";
import {
    IContainerRuntime,
} from "@fluidframework/container-runtime-definitions";
import {
    channelsTreeName,
    CreateChildSummarizerNodeFn,
    CreateChildSummarizerNodeParam,
    FluidDataStoreRegistryEntry,
    gcBlobKey,
    IAttachMessage,
    IContextSummarizeResult,
    IFluidDataStoreChannel,
    IFluidDataStoreContext,
    IFluidDataStoreContextDetached,
    IFluidDataStoreContextEvents,
    IFluidDataStoreRegistry,
    IGarbageCollectionData,
    IGarbageCollectionSummaryDetails,
    IInboundSignalMessage,
    IProvideFluidDataStoreFactory,
    ISummarizeInternalResult,
    ISummarizerNodeWithGC,
    SummarizeInternalFn,
} from "@fluidframework/runtime-definitions";
import { addBlobToSummary, convertSummaryTreeToITree } from "@fluidframework/runtime-utils";
import { LoggingError, TelemetryDataTag } from "@fluidframework/telemetry-utils";
import { CreateProcessingError } from "@fluidframework/container-utils";
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
    disableIsolatedChannels: boolean,
): WriteFluidDataStoreAttributes {
    const stringifiedPkg = JSON.stringify(pkg);
    return disableIsolatedChannels ? {
        pkg: stringifiedPkg,
        snapshotFormatVersion: "0.1",
        isRootDataStore,
    } : {
        pkg: stringifiedPkg,
        summaryFormatVersion: 2,
        isRootDataStore,
    };
}
export function createAttributesBlob(
    pkg: readonly string[],
    isRootDataStore: boolean,
    disableIsolatedChannels: boolean,
): ITreeEntry {
    const attributes = createAttributes(pkg, isRootDataStore, disableIsolatedChannels);
    return new BlobTreeEntry(dataStoreAttributesBlobName, JSON.stringify(attributes));
}

interface ISnapshotDetails {
    pkg: readonly string[];
    /**
     * This tells whether a data store is root. Root data stores are never collected.
     * Non-root data stores may be collected if they are not used.
     */
    isRootDataStore: boolean;
    snapshot?: ISnapshotTree;
}

interface FluidDataStoreMessage {
    content: any;
    type: string;
}

/**
 * Represents the context for the store. This context is passed to the store runtime.
 */
export abstract class FluidDataStoreContext extends TypedEventEmitter<IFluidDataStoreContextEvents> implements
    IFluidDataStoreContext,
    IDisposable {
    public get documentId(): string {
        return this._containerRuntime.id;
    }

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

    public get loader(): ILoader {
        return this._containerRuntime.loader;
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

    public async isRoot(): Promise<boolean> {
        return (await this.getInitialSnapshotDetails()).isRootDataStore;
    }

    protected get disableIsolatedChannels(): boolean {
        return this._containerRuntime.disableIsolatedChannels;
    }

    protected registry: IFluidDataStoreRegistry | undefined;

    protected detachedRuntimeCreation = false;
    public readonly bindToContext: () => void;
    protected channel: IFluidDataStoreChannel | undefined;
    private loaded = false;
    protected pending: ISequencedDocumentMessage[] | undefined = [];
    protected channelDeferred: Deferred<IFluidDataStoreChannel> | undefined;
    private _baseSnapshot: ISnapshotTree | undefined;
    protected _attachState: AttachState;
    protected readonly summarizerNode: ISummarizerNodeWithGC;

    constructor(
        private readonly _containerRuntime: ContainerRuntime,
        public readonly id: string,
        public readonly existing: boolean,
        public readonly storage: IDocumentStorageService,
        public readonly scope: IFluidObject,
        createSummarizerNode: CreateChildSummarizerNodeFn,
        private bindState: BindState,
        public readonly isLocalDataStore: boolean,
        bindChannel: (channel: IFluidDataStoreChannel) => void,
        protected pkg?: readonly string[],
    ) {
        super();

        // URIs use slashes as delimiters. Handles use URIs.
        // Thus having slashes in types almost guarantees trouble down the road!
        assert(id.indexOf("/") === -1, 0x13a /* `Data store ID contains slash: ${id}` */);

        this._attachState = this.containerRuntime.attachState !== AttachState.Detached && existing ?
            this.containerRuntime.attachState : AttachState.Detached;

        this.bindToContext = () => {
            assert(this.bindState === BindState.NotBound, 0x13b /* "datastore context is already in bound state" */);
            this.bindState = BindState.Binding;
            assert(this.channel !== undefined, 0x13c /* "undefined channel on datastore context" */);
            bindChannel(this.channel);
            this.bindState = BindState.Bound;
        };

        const thisSummarizeInternal =
            async (fullTree: boolean, trackState: boolean) => this.summarizeInternal(fullTree, trackState);

        this.summarizerNode = createSummarizerNode(
            thisSummarizeInternal,
            async (fullGC?: boolean) => this.getGCDataInternal(fullGC),
            async () => this.getInitialGCSummaryDetails(),
        );
    }

    public dispose(): void {
        if (this._disposed) {
            return;
        }
        this._disposed = true;

        // Dispose any pending runtime after it gets fulfilled
        if (this.channelDeferred) {
            this.channelDeferred.promise.then((runtime) => {
                runtime.dispose();
            }).catch((error) => {
                this.logger.sendErrorEvent(
                    { eventName: "ChannelDisposeError", fluidDataStoreId: this.id },
                    error);
            });
        }
    }

    private rejectDeferredRealize(reason: string, packageName?: string): never {
        throw new LoggingError(reason, { packageName: { value: packageName, tag: TelemetryDataTag.PackageData }});
    }

    public async realize(): Promise<IFluidDataStoreChannel> {
        assert(!this.detachedRuntimeCreation, 0x13d /* "Detached runtime creation on realize()" */);
        if (!this.channelDeferred) {
            this.channelDeferred = new Deferred<IFluidDataStoreChannel>();
            this.realizeCore().catch((error) => {
                this.channelDeferred?.reject(CreateProcessingError(error, undefined /* message */));
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

    private async realizeCore(): Promise<void> {
        const details = await this.getInitialSnapshotDetails();
        // Base snapshot is the baseline where pending ops are applied to.
        // It is important that this be in sync with the pending ops, and also
        // that it is set here, before bindRuntime is called.
        this._baseSnapshot = details.snapshot;
        const packages = details.pkg;

        const { factory, registry } = await this.factoryFromPackagePath(packages);

        assert(this.registry === undefined, 0x13f /* "datastore context registry is already set" */);
        this.registry = registry;

        const channel = await factory.instantiateDataStore(this);
        assert(channel !== undefined, 0x140 /* "undefined channel on datastore context" */);
        this.bindRuntime(channel);
    }

    /**
     * Notifies this object about changes in the connection state.
     * @param value - New connection state.
     * @param clientId - ID of the client. It's old ID when in disconnected state and
     * it's new client ID when we are connecting or connected.
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
            this.pending?.push(message);
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

    public getQuorum(): IQuorum {
        return this._containerRuntime.getQuorum();
    }

    public getAudience(): IAudience {
        return this._containerRuntime.getAudience();
    }

    /**
     * Returns a summary at the current sequence number.
     * @param fullTree - true to bypass optimizations and force a full summary tree
     * @param trackState - This tells whether we should track state from this summary.
     */
    public async summarize(fullTree: boolean = false, trackState: boolean = true): Promise<IContextSummarizeResult> {
        return this.summarizerNode.summarize(fullTree, trackState);
    }

    private async summarizeInternal(fullTree: boolean, trackState: boolean): Promise<ISummarizeInternalResult> {
        await this.realize();

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const summarizeResult = await this.channel!.summarize(fullTree, trackState);
        let pathPartsForChildren: string[] | undefined;

        if (!this.disableIsolatedChannels) {
            // Wrap dds summaries in .channels subtree.
            wrapSummaryInChannelsTree(summarizeResult);
            pathPartsForChildren = [channelsTreeName];
        }

        // Add data store's attributes to the summary.
        const { pkg, isRootDataStore } = await this.getInitialSnapshotDetails();
        const attributes = createAttributes(pkg, isRootDataStore, this.disableIsolatedChannels);
        addBlobToSummary(summarizeResult, dataStoreAttributesBlobName, JSON.stringify(attributes));

        // Add GC details to the summary.
        const gcDetails: IGarbageCollectionSummaryDetails = {
            usedRoutes: this.summarizerNode.usedRoutes,
            gcData: summarizeResult.gcData,
        };
        addBlobToSummary(summarizeResult, gcBlobKey, JSON.stringify(gcDetails));

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
     * 1. To identify if this data store is being referenced in the document or not.
     * 2. To determine if it needs to re-summarize in case used routes changed since last summary.
     * 3. These are added to the summary generated by the data store.
     * 4. To notify child contexts of their used routes. This is done immediately if the data store is loaded. Else,
     *    it is done when realizing the data store.
     * @param usedRoutes - The routes that are used in this data store.
     */
    public updateUsedRoutes(usedRoutes: string[]) {
        // Currently, only data stores can be collected. Once we have GC at DDS layer, the DDS' in the data store will
        // also be notified of their used routes. See - https://github.com/microsoft/FluidFramework/issues/4611

        // Update the used routes in this data store's summarizer node.
        this.summarizerNode.updateUsedRoutes(usedRoutes);

        // If we are loaded, call the channel so it can update the used routes of the child contexts.
        // If we are not loaded, we will update this when we are realized.
        if (this.loaded) {
            this.updateChannelUsedRoutes();
        }
    }

    /**
     * Updates the used routes of the channel and its child contexts. The channel must be loaded before calling this.
     * It is called in these two scenarions:
     * 1. When the used routes of the data store is updated and the data store is loaded.
     * 2. When the data store is realized. This updates the channel's used routes as per last GC run.
     */
    private updateChannelUsedRoutes() {
        assert(this.loaded, 0x144 /* "Channel should be loaded when updating used routes" */);
        assert(this.channel !== undefined, 0x145 /* "Channel should be present when data store is loaded" */);

        // Remove the route to this data store, if it exists.
        const usedChannelRoutes = this.summarizerNode.usedRoutes.filter(
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

    public raiseContainerWarning(warning: ContainerWarning): void {
        this.containerRuntime.raiseContainerWarning(warning);
    }

    protected bindRuntime(channel: IFluidDataStoreChannel) {
        if (this.channel) {
            throw new Error("Runtime already bound");
        }

        try
        {
            assert(!this.detachedRuntimeCreation, 0x148 /* "Detached runtime creation on runtime bind" */);
            assert(this.channelDeferred !== undefined, 0x149 /* "Undefined channel defferal" */);
            assert(this.pkg !== undefined, 0x14a /* "Undefined package path" */);

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const pending = this.pending!;

            if (pending.length > 0) {
                // Apply all pending ops
                for (const op of pending) {
                    channel.process(op, false, undefined /* localOpMetadata */);
                }
            }

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
        }
    }

    public async getAbsoluteUrl(relativeUrl: string): Promise<string | undefined> {
        if (this.attachState !== AttachState.Attached) {
            return undefined;
        }
        return this._containerRuntime.getAbsoluteUrl(relativeUrl);
    }

    public abstract generateAttachMessage(): IAttachMessage;

    protected abstract getInitialSnapshotDetails(): Promise<ISnapshotDetails>;

    public abstract getInitialGCSummaryDetails(): Promise<IGarbageCollectionSummaryDetails>;

    public reSubmit(contents: any, localOpMetadata: unknown) {
        assert(!!this.channel, 0x14b /* "Channel must exist when resubmitting ops" */);
        const innerContents = contents as FluidDataStoreMessage;
        this.channel.reSubmit(innerContents.type, innerContents.content, localOpMetadata);
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
            getInitialGCSummaryDetailsFn: () => Promise<IGarbageCollectionSummaryDetails>,
        ) => this.summarizerNode.createChild(
            summarizeInternal,
            id,
            createParam,
            // DDS will not create failure summaries
            { throwOnFailure: true },
            getGCDataFn,
            getInitialGCSummaryDetailsFn,
        );
    }

    public async uploadBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>> {
        return this.containerRuntime.uploadBlob(blob);
    }
}

export class RemotedFluidDataStoreContext extends FluidDataStoreContext {
    constructor(
        id: string,
        private readonly initSnapshotValue: ISnapshotTree | string | undefined,
        runtime: ContainerRuntime,
        storage: IDocumentStorageService,
        scope: IFluidObject,
        createSummarizerNode: CreateChildSummarizerNodeFn,
        pkg?: string[],
    ) {
        super(
            runtime,
            id,
            true,
            storage,
            scope,
            createSummarizerNode,
            BindState.Bound,
            false,
            () => {
                throw new Error("Already attached");
            },
            pkg,
        );
    }

    private readonly initialSnapshotDetailsP =  new LazyPromise<ISnapshotDetails>(async () => {
        let tree: ISnapshotTree | undefined;
        let isRootDataStore = true;

        if (typeof this.initSnapshotValue === "string") {
            const commit = (await this.storage.getVersions(this.initSnapshotValue, 1))[0];
            tree = await this.storage.getSnapshotTree(commit) ?? undefined;
        } else {
            tree = this.initSnapshotValue;
        }

        const localReadAndParse = async <T>(id: string) => readAndParse<T>(this.storage, id);
        if (tree) {
            const loadedSummary = await this.summarizerNode.loadBaseSummary(tree, localReadAndParse);
            tree = loadedSummary.baseSummary;
            // Prepend outstanding ops to pending queue of ops to process.
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.pending = loadedSummary.outstandingOps.concat(this.pending!);
        }

        if (!!tree && tree.blobs[dataStoreAttributesBlobName] !== undefined) {
            // Need to get through snapshot and use that to populate extraBlobs
            const attributes =
                await localReadAndParse<ReadFluidDataStoreAttributes>(tree.blobs[dataStoreAttributesBlobName]);

            let pkgFromSnapshot: string[];
            // Use the snapshotFormatVersion to determine how the pkg is encoded in the snapshot.
            // For snapshotFormatVersion = "0.1" (1) or above, pkg is jsonified, otherwise it is just a string.
            const formatVersion = getAttributesFormatVersion(attributes);
            if (formatVersion < 1) {
                if (attributes.pkg.startsWith("[\"") && attributes.pkg.endsWith("\"]")) {
                    pkgFromSnapshot = JSON.parse(attributes.pkg) as string[];
                } else {
                    pkgFromSnapshot = [attributes.pkg];
                }
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
            snapshot: tree,
            isRootDataStore,
        };
    });

    private readonly gcDetailsInInitialSummaryP = new LazyPromise<IGarbageCollectionSummaryDetails>(async () => {
        // If the initial snapshot is undefined or string, the snapshot is in old format and won't have GC details.
        if (!(!this.initSnapshotValue || typeof this.initSnapshotValue === "string")
            && this.initSnapshotValue.blobs[gcBlobKey] !== undefined) {
            return readAndParse<IGarbageCollectionSummaryDetails>(
                this.storage,
                this.initSnapshotValue.blobs[gcBlobKey],
            );
        } else {
            return {};
        }
    });

    protected async getInitialSnapshotDetails(): Promise<ISnapshotDetails> {
        return this.initialSnapshotDetailsP;
    }

    public async getInitialGCSummaryDetails(): Promise<IGarbageCollectionSummaryDetails> {
        return this.gcDetailsInInitialSummaryP;
    }

    public generateAttachMessage(): IAttachMessage {
        throw new Error("Cannot attach remote store");
    }
}

/**
 * Base class for detached & attached context classes
 */
export class LocalFluidDataStoreContextBase extends FluidDataStoreContext {
    constructor(
        id: string,
        pkg: Readonly<string[]> | undefined,
        runtime: ContainerRuntime,
        storage: IDocumentStorageService,
        scope: IFluidObject,
        createSummarizerNode: CreateChildSummarizerNodeFn,
        bindChannel: (channel: IFluidDataStoreChannel) => void,
        private readonly snapshotTree: ISnapshotTree | undefined,
        protected isRootDataStore: boolean | undefined,
        /**
         * @deprecated 0.16 Issue #1635, #3631
         */
        public readonly createProps?: any,
    ) {
        super(
            runtime,
            id,
            snapshotTree !== undefined ? true : false,
            storage,
            scope,
            createSummarizerNode,
            snapshotTree ? BindState.Bound : BindState.NotBound,
            true,
            bindChannel,
            pkg);
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
        assert(this.isRootDataStore !== undefined,
            0x151 /* "isRootDataStore should be available in local data store context" */);

        const summarizeResult = this.channel.getAttachSummary();

        if (!this.disableIsolatedChannels) {
            // Wrap dds summaries in .channels subtree.
            wrapSummaryInChannelsTree(summarizeResult);
        }

        // Add data store's attributes to the summary.
        const attributes = createAttributes(
            this.pkg,
            this.isRootDataStore,
            this.disableIsolatedChannels,
        );
        addBlobToSummary(summarizeResult, dataStoreAttributesBlobName, JSON.stringify(attributes));

        // Add GC details to the summary.
        const gcDetails: IGarbageCollectionSummaryDetails = {
            usedRoutes: this.summarizerNode.usedRoutes,
            gcData: summarizeResult.gcData,
        };
        addBlobToSummary(summarizeResult, gcBlobKey, JSON.stringify(gcDetails));

        // Attach message needs the summary in ITree format. Convert the ISummaryTree into an ITree.
        const snapshot = convertSummaryTreeToITree(summarizeResult.summary);

        const message: IAttachMessage = {
            id: this.id,
            snapshot,
            type: this.pkg[this.pkg.length - 1],
        };

        return message;
    }

    protected async getInitialSnapshotDetails(): Promise<ISnapshotDetails> {
        let snapshot = this.snapshotTree;
        let attributes: ReadFluidDataStoreAttributes;
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
                this.isRootDataStore = attributes.isRootDataStore ?? true;
            }
        }
        assert(this.pkg !== undefined, 0x152 /* "pkg should be available in local data store" */);
        assert(this.isRootDataStore !== undefined,
            0x153 /* "isRootDataStore should be available in local data store" */);

        return {
            pkg: this.pkg,
            snapshot,
            isRootDataStore: this.isRootDataStore,
        };
    }

    public async getInitialGCSummaryDetails(): Promise<IGarbageCollectionSummaryDetails> {
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
    constructor(
        id: string,
        pkg: string[] | undefined,
        runtime: ContainerRuntime,
        storage: IDocumentStorageService,
        scope: IFluidObject & IFluidObject,
        createSummarizerNode: CreateChildSummarizerNodeFn,
        bindChannel: (channel: IFluidDataStoreChannel) => void,
        snapshotTree: ISnapshotTree | undefined,
        isRootDataStore: boolean | undefined,
        /**
         * @deprecated 0.16 Issue #1635, #3631
         */
        createProps?: any,
    ) {
        super(
            id,
            pkg,
            runtime,
            storage,
            scope,
            createSummarizerNode,
            bindChannel,
            snapshotTree,
            isRootDataStore,
            createProps);
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
    implements IFluidDataStoreContextDetached
{
    constructor(
        id: string,
        pkg: Readonly<string[]>,
        runtime: ContainerRuntime,
        storage: IDocumentStorageService,
        scope: IFluidObject & IFluidObject,
        createSummarizerNode: CreateChildSummarizerNodeFn,
        bindChannel: (channel: IFluidDataStoreChannel) => void,
        snapshotTree: ISnapshotTree | undefined,
        isRootDataStore: boolean,
    ) {
        super(
            id,
            pkg,
            runtime,
            storage,
            scope,
            createSummarizerNode,
            bindChannel,
            snapshotTree,
            isRootDataStore,
        );
        this.detachedRuntimeCreation = true;
    }

    public async attachRuntime(
        registry: IProvideFluidDataStoreFactory,
        dataStoreRuntime: IFluidDataStoreChannel)
    {
        assert(this.detachedRuntimeCreation, 0x154 /* "runtime creation is already attached" */);
        assert(this.channelDeferred === undefined, 0x155 /* "channel deferral is already set" */);

        const factory = registry.IFluidDataStoreFactory;

        const entry = await this.factoryFromPackagePath(this.pkg);
        assert(entry.factory === factory, 0x156 /* "Unexpected factory for package path" */);

        assert(this.registry === undefined, 0x157 /* "datastore registry already attached" */);
        this.registry = entry.registry;

        this.detachedRuntimeCreation = false;
        this.channelDeferred = new Deferred<IFluidDataStoreChannel>();

        super.bindRuntime(dataStoreRuntime);

        if (this.isRootDataStore) {
            dataStoreRuntime.bindToContext();
        }
    }

    protected async getInitialSnapshotDetails(): Promise<ISnapshotDetails> {
        if (this.detachedRuntimeCreation) {
            throw new Error("Detached Fluid Data Store context can't be realized! Please attach runtime first!");
        }
        return super.getInitialSnapshotDetails();
    }
}
