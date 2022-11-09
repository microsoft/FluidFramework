/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    IFluidHandle,
    IFluidHandleContext,
    IRequest,
    IResponse,
} from "@fluidframework/core-interfaces";
import {
    IAudience,
    IDeltaManager,
    AttachState,
    ILoaderOptions,
} from "@fluidframework/container-definitions";
import { DataProcessingError, UsageError } from "@fluidframework/container-utils";
import {
    assert,
    Deferred,
    LazyPromise,
    TypedEventEmitter,
    unreachableCase,
} from "@fluidframework/common-utils";
import {
    ChildLogger,
    LoggingError,
    raiseConnectedEvent,
} from "@fluidframework/telemetry-utils";
import { buildSnapshotTree } from "@fluidframework/driver-utils";
import {
    IClientDetails,
    IDocumentMessage,
    ISequencedDocumentMessage,
    SummaryType,
    ISummaryBlob,
    ISummaryTree,
    IQuorumClients,
} from "@fluidframework/protocol-definitions";
import {
    BindState,
    CreateSummarizerNodeSource,
    IAttachMessage,
    IEnvelope,
    IFluidDataStoreContext,
    IFluidDataStoreChannel,
    IGarbageCollectionData,
    IGarbageCollectionDetailsBase,
    IInboundSignalMessage,
    ISummaryTreeWithStats,
    VisibilityState,
    ITelemetryContext,
} from "@fluidframework/runtime-definitions";
import {
    convertSnapshotTreeToSummaryTree,
    convertSummaryTreeToITree,
    generateHandleContextPath,
    RequestParser,
    SummaryTreeBuilder,
    create404Response,
    createResponseError,
    exceptionToResponse,
} from "@fluidframework/runtime-utils";
import {
    IChannel,
    IFluidDataStoreRuntime,
    IFluidDataStoreRuntimeEvents,
    IChannelFactory,
} from "@fluidframework/datastore-definitions";
import {
    GCDataBuilder,
    removeRouteFromAllNodes,
    unpackChildNodesGCDetails,
    unpackChildNodesUsedRoutes,
} from "@fluidframework/garbage-collector";
import { v4 as uuid } from "uuid";
import { IChannelContext, summarizeChannel } from "./channelContext";
import { LocalChannelContext, LocalChannelContextBase, RehydratedLocalChannelContext } from "./localChannelContext";
import { RemoteChannelContext } from "./remoteChannelContext";

export enum DataStoreMessageType {
    // Creates a new channel
    Attach = "attach",
    ChannelOp = "op",
}

export interface ISharedObjectRegistry {
    // TODO consider making this async. A consequence is that either the creation of a distributed data type
    // is async or we need a new API to split the synchronous vs. asynchronous creation.
    get(name: string): IChannelFactory | undefined;
}

/**
 * Base data store class
 */
export class FluidDataStoreRuntime extends
TypedEventEmitter<IFluidDataStoreRuntimeEvents> implements
IFluidDataStoreChannel, IFluidDataStoreRuntime, IFluidHandleContext {
    /**
     * Loads the data store runtime
     * @param context - The data store context
     * @param sharedObjectRegistry - The registry of shared objects used by this data store
     * @param existing - If loading from an existing file.
     */
    public static load(
        context: IFluidDataStoreContext,
        sharedObjectRegistry: ISharedObjectRegistry,
        existing: boolean,
    ): FluidDataStoreRuntime {
        return new FluidDataStoreRuntime(context, sharedObjectRegistry, existing);
    }

    public get IFluidRouter() { return this; }

    public get connected(): boolean {
        return this.dataStoreContext.connected;
    }

    public get clientId(): string | undefined {
        return this.dataStoreContext.clientId;
    }

    public get clientDetails(): IClientDetails {
        return this.dataStoreContext.clientDetails;
    }

    public get isAttached(): boolean {
        return this.attachState !== AttachState.Detached;
    }

    public get attachState(): AttachState {
        return this._attachState;
    }

    public get absolutePath(): string {
        return generateHandleContextPath(this.id, this.routeContext);
    }

    public get routeContext(): IFluidHandleContext {
        return this.dataStoreContext.IFluidHandleContext;
    }

    public get IFluidHandleContext() { return this; }

    public get rootRoutingContext() { return this; }
    public get channelsRoutingContext() { return this; }
    public get objectsRoutingContext() { return this; }

    private _disposed = false;
    public get disposed() { return this._disposed; }

    private readonly contexts = new Map<string, IChannelContext>();
    private readonly contextsDeferred = new Map<string, Deferred<IChannelContext>>();
    private readonly pendingAttach = new Map<string, IAttachMessage>();

    private bindState: BindState;
    private readonly deferredAttached = new Deferred<void>();
    private readonly localChannelContextQueue = new Map<string, LocalChannelContextBase>();
    private readonly notBoundedChannelContextSet = new Set<string>();
    private _attachState: AttachState;
    public visibilityState: VisibilityState;
    // A list of handles that are bound when the data store is not visible. We have to make them visible when the data
    // store becomes visible.
    private readonly pendingHandlesToMakeVisible: Set<IFluidHandle> = new Set();

    public readonly id: string;
    public readonly options: ILoaderOptions;
    public readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>;
    private readonly quorum: IQuorumClients;
    private readonly audience: IAudience;
    public readonly logger: ITelemetryLogger;

    // A map of child channel context ids to the their base GC details. This is used to initialize the GC state of the
    // channel contexts.
    private readonly channelsBaseGCDetails: LazyPromise<Map<string, IGarbageCollectionDetailsBase>>;

    public constructor(
        private readonly dataStoreContext: IFluidDataStoreContext,
        private readonly sharedObjectRegistry: ISharedObjectRegistry,
        existing: boolean,
    ) {
        super();

        assert(!dataStoreContext.id.includes("/"),
            0x30e /* Id cannot contain slashes. DataStoreContext should have validated this. */);

        this.logger = ChildLogger.create(
            dataStoreContext.logger,
            "FluidDataStoreRuntime",
            { all: { dataStoreId: uuid() } },
        );

        this.id = dataStoreContext.id;
        this.options = dataStoreContext.options;
        this.deltaManager = dataStoreContext.deltaManager;
        this.quorum = dataStoreContext.getQuorum();
        this.audience = dataStoreContext.getAudience();

        const tree = dataStoreContext.baseSnapshot;

        this.channelsBaseGCDetails = new LazyPromise(async () => {
            const baseGCDetails = await this.dataStoreContext.getBaseGCDetails();
            return unpackChildNodesGCDetails(baseGCDetails);
        });

        // Must always receive the data store type inside of the attributes
        if (tree?.trees !== undefined) {
            Object.keys(tree.trees).forEach((path) => {
                // Issue #4414
                if (path === "_search") { return; }

                let channelContext: IChannelContext;
                // If already exists on storage, then create a remote channel. However, if it is case of rehydrating a
                // container from snapshot where we load detached container from a snapshot, isLocalDataStore would be
                // true. In this case create a RehydratedLocalChannelContext.
                if (dataStoreContext.isLocalDataStore) {
                    channelContext = new RehydratedLocalChannelContext(
                        path,
                        this.sharedObjectRegistry,
                        this,
                        this.dataStoreContext,
                        this.dataStoreContext.storage,
                        this.logger,
                        (content, localOpMetadata) => this.submitChannelOp(path, content, localOpMetadata),
                        (address: string) => this.setChannelDirty(address),
                        (srcHandle: IFluidHandle, outboundHandle: IFluidHandle) =>
                            this.addedGCOutboundReference(srcHandle, outboundHandle),
                        tree.trees[path]);
                    // This is the case of rehydrating a detached container from snapshot. Now due to delay loading of
                    // data store, if the data store is loaded after the container is attached, then we missed making
                    // the channel visible. So do it now. Otherwise, add it to local channel context queue, so
                    // that it can be make it visible later with the data store.
                    if (dataStoreContext.attachState !== AttachState.Detached) {
                        (channelContext as LocalChannelContextBase).makeVisible();
                    } else {
                        this.localChannelContextQueue.set(path, channelContext as LocalChannelContextBase);
                    }
                } else {
                    channelContext = new RemoteChannelContext(
                        this,
                        dataStoreContext,
                        dataStoreContext.storage,
                        (content, localOpMetadata) => this.submitChannelOp(path, content, localOpMetadata),
                        (address: string) => this.setChannelDirty(address),
                        (srcHandle: IFluidHandle, outboundHandle: IFluidHandle) =>
                            this.addedGCOutboundReference(srcHandle, outboundHandle),
                        path,
                        tree.trees[path],
                        this.sharedObjectRegistry,
                        undefined /* extraBlobs */,
                        this.dataStoreContext.getCreateChildSummarizerNodeFn(
                            path,
                            { type: CreateSummarizerNodeSource.FromSummary },
                        ),
                        async () => this.getChannelBaseGCDetails(path));
                }
                const deferred = new Deferred<IChannelContext>();
                deferred.resolve(channelContext);

                this.contexts.set(path, channelContext);
                this.contextsDeferred.set(path, deferred);
            });
        }

        this.attachListener();
        // If exists on storage or loaded from a snapshot, it should already be bound.
        this.bindState = existing ? BindState.Bound : BindState.NotBound;
        this._attachState = dataStoreContext.attachState;

        /**
         * If existing flag is false, this is a new data store and is not visible. The existing flag can be true in two
         * conditions:
         *
         * 1. It's a local data store that is created when a detached container is rehydrated. In this case, the data
         * store is locally visible because the snapshot it is loaded from contains locally visible data stores only.
         *
         * 2. It's a remote data store that is created when an attached container is loaded is loaded from snapshot or
         * when an attach op comes in. In both these cases, the data store is already globally visible.
         */
        if (existing) {
            this.visibilityState = dataStoreContext.attachState === AttachState.Detached
                ? VisibilityState.LocallyVisible : VisibilityState.GloballyVisible;
        } else {
            this.visibilityState = VisibilityState.NotVisible;
        }

        // If it's existing we know it has been attached.
        if (existing) {
            this.deferredAttached.resolve();
        }
    }

    public dispose(): void {
        if (this._disposed) {
            return;
        }
        this._disposed = true;

        this.emit("dispose");
        this.removeAllListeners();
    }

    public async resolveHandle(request: IRequest): Promise<IResponse> {
        return this.request(request);
    }

    public async request(request: IRequest): Promise<IResponse> {
        try {
            const parser = RequestParser.create(request);
            const id = parser.pathParts[0];

            if (id === "_channels" || id === "_custom") {
                return this.request(parser.createSubRequest(1));
            }

            // Check for a data type reference first
            if (this.contextsDeferred.has(id) && parser.isLeaf(1)) {
                try {
                    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                    const value = await this.contextsDeferred.get(id)!.promise;
                    const channel = await value.getChannel();

                    return { mimeType: "fluid/object", status: 200, value: channel };
                } catch (error) {
                    this.logger.sendErrorEvent({ eventName: "GetChannelFailedInRequest" }, error);

                    return createResponseError(500, `Failed to get Channel: ${error}`, request);
                }
            }

            // Otherwise defer to an attached request handler
            return create404Response(request);
        } catch (error) {
            return exceptionToResponse(error);
        }
    }

    public async getChannel(id: string): Promise<IChannel> {
        this.verifyNotClosed();

        // TODO we don't assume any channels (even root) in the runtime. If you request a channel that doesn't exist
        // we will never resolve the promise. May want a flag to getChannel that doesn't wait for the promise if
        // it doesn't exist
        if (!this.contextsDeferred.has(id)) {
            this.contextsDeferred.set(id, new Deferred<IChannelContext>());
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const context = await this.contextsDeferred.get(id)!.promise;
        const channel = await context.getChannel();

        return channel;
    }

    public createChannel(id: string = uuid(), type: string): IChannel {
        if (id.includes("/")) {
            throw new UsageError(`Id cannot contain slashes: ${id}`);
        }

        this.verifyNotClosed();

        assert(!this.contexts.has(id), 0x179 /* "createChannel() with existing ID" */);
        this.notBoundedChannelContextSet.add(id);
        const context = new LocalChannelContext(
            id,
            this.sharedObjectRegistry,
            type,
            this,
            this.dataStoreContext,
            this.dataStoreContext.storage,
            this.logger,
            (content, localOpMetadata) => this.submitChannelOp(id, content, localOpMetadata),
            (address: string) => this.setChannelDirty(address),
            (srcHandle: IFluidHandle, outboundHandle: IFluidHandle) =>
                this.addedGCOutboundReference(srcHandle, outboundHandle));
        this.contexts.set(id, context);

        if (this.contextsDeferred.has(id)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.contextsDeferred.get(id)!.resolve(context);
        } else {
            const deferred = new Deferred<IChannelContext>();
            deferred.resolve(context);
            this.contextsDeferred.set(id, deferred);
        }

        assert(!!context.channel, 0x17a /* "Channel should be loaded when created!!" */);
        return context.channel;
    }

    /**
     * Binds a channel with the runtime. If the runtime is attached we will attach the channel right away.
     * If the runtime is not attached we will defer the attach until the runtime attaches.
     * @param channel - channel to be registered.
     */
    public bindChannel(channel: IChannel): void {
        assert(this.notBoundedChannelContextSet.has(channel.id),
        0x17b /* "Channel to be binded should be in not bounded set" */);
        this.notBoundedChannelContextSet.delete(channel.id);
        // If our data store is attached, then attach the channel.
        if (this.isAttached) {
            this.attachChannel(channel);
            return;
        }

        /**
         * If this channel is already waiting to be made visible, do nothing. This can happen during attachGraph() when
         * a channel's graph is attached. It calls bindToContext on the shared object which will end up back here.
         */
        if (this.pendingHandlesToMakeVisible.has(channel.handle)) {
            return;
        }

        this.bind(channel.handle);

        // If our data store is local then add the channel to the queue
        if (!this.localChannelContextQueue.has(channel.id)) {
            this.localChannelContextQueue.set(channel.id, this.contexts.get(channel.id) as LocalChannelContextBase);
        }
    }

    /**
     * This function is called when a data store becomes root. It does the following:
     *
     * 1. Marks the data store locally visible in the container.
     *
     * 2. Attaches the graph of all the handles bound to it.
     *
     * 3. Calls into the data store context to mark it visible in the container too. If the container is globally
     * visible, it will mark us globally visible. Otherwise, it will mark us globally visible when it becomes
     * globally visible.
     */
    public makeVisibleAndAttachGraph() {
        if (this.visibilityState !== VisibilityState.NotVisible) {
            return;
        }
        this.visibilityState = VisibilityState.LocallyVisible;

        this.pendingHandlesToMakeVisible.forEach((handle) => {
            handle.attachGraph();
        });
        this.pendingHandlesToMakeVisible.clear();
        this.bindToContext();
    }

    /**
     * This function is called when a handle to this data store is added to a visible DDS.
     */
    public attachGraph() {
        this.makeVisibleAndAttachGraph();
    }

    /**
     * @deprecated - Not necessary if consumers add a new dataStore to the container by storing its handle.
     * Binds this runtime to the container
     * This includes the following:
     * 1. Sending an Attach op that includes all existing state
     * 2. Attaching the graph if the data store becomes attached.
     */
    public bindToContext() {
        if (this.bindState !== BindState.NotBound) {
            return;
        }
        this.bindState = BindState.Binding;
        this.dataStoreContext.bindToContext();
        this.bindState = BindState.Bound;
    }

    public bind(handle: IFluidHandle): void {
        // If visible, attach the incoming handle's graph. Else, this will be done when we become visible.
        if (this.visibilityState !== VisibilityState.NotVisible) {
            handle.attachGraph();
            return;
        }
        this.pendingHandlesToMakeVisible.add(handle);
    }

    public setConnectionState(connected: boolean, clientId?: string) {
        this.verifyNotClosed();

        for (const [, object] of this.contexts) {
            object.setConnectionState(connected, clientId);
        }

        raiseConnectedEvent(this.logger, this, connected, clientId);
    }

    public getQuorum(): IQuorumClients {
        return this.quorum;
    }

    public getAudience(): IAudience {
        return this.audience;
    }

    public async uploadBlob(blob: ArrayBufferLike): Promise<IFluidHandle<ArrayBufferLike>> {
        this.verifyNotClosed();

        return this.dataStoreContext.uploadBlob(blob);
    }

    public process(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        this.verifyNotClosed();

        try {
            // catches as data processing error whether or not they come from async pending queues
            switch (message.type) {
                case DataStoreMessageType.Attach: {
                    const attachMessage = message.contents as IAttachMessage;
                    const id = attachMessage.id;

                    // If a non-local operation then go and create the object
                    // Otherwise mark it as officially attached.
                    if (local) {
                        assert(this.pendingAttach.has(id), 0x17c /* "Unexpected attach (local) channel OP" */);
                        this.pendingAttach.delete(id);
                    } else {
                        assert(!this.contexts.has(id),
                        0x17d, /* `Unexpected attach channel OP,
                            is in pendingAttach set: ${this.pendingAttach.has(id)},
                            is local channel contexts: ${this.contexts.get(id) instanceof LocalChannelContextBase}` */);

                        const flatBlobs = new Map<string, ArrayBufferLike>();
                        const snapshotTree = buildSnapshotTree(attachMessage.snapshot.entries, flatBlobs);

                        const remoteChannelContext = new RemoteChannelContext(
                            this,
                            this.dataStoreContext,
                            this.dataStoreContext.storage,
                            (content, localContentMetadata) => this.submitChannelOp(id, content, localContentMetadata),
                            (address: string) => this.setChannelDirty(address),
                            (srcHandle: IFluidHandle, outboundHandle: IFluidHandle) =>
                                this.addedGCOutboundReference(srcHandle, outboundHandle),
                            id,
                            snapshotTree,
                            this.sharedObjectRegistry,
                            flatBlobs,
                            this.dataStoreContext.getCreateChildSummarizerNodeFn(
                                id,
                                {
                                    type: CreateSummarizerNodeSource.FromAttach,
                                    sequenceNumber: message.sequenceNumber,
                                    snapshot: attachMessage.snapshot,
                                },
                            ),
                            async () => this.getChannelBaseGCDetails(id),
                            attachMessage.type);

                        this.contexts.set(id, remoteChannelContext);
                        if (this.contextsDeferred.has(id)) {
                            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                            this.contextsDeferred.get(id)!.resolve(remoteChannelContext);
                        } else {
                            const deferred = new Deferred<IChannelContext>();
                            deferred.resolve(remoteChannelContext);
                            this.contextsDeferred.set(id, deferred);
                        }
                    }
                    break;
                }

                case DataStoreMessageType.ChannelOp:
                    this.processChannelOp(message, local, localOpMetadata);
                    break;
                default:
            }

            this.emit("op", message);
        } catch (error) {
            throw DataProcessingError.wrapIfUnrecognized(error, "fluidDataStoreRuntimeFailedToProcessMessage", message);
        }
    }

    public processSignal(message: IInboundSignalMessage, local: boolean) {
        this.emit("signal", message, local);
    }

    private isChannelAttached(id: string): boolean {
        return (
            // Added in createChannel
            // Removed when bindChannel is called
            !this.notBoundedChannelContextSet.has(id)
            // Added in bindChannel only if this is not attached yet
            // Removed when this is attached by calling attachGraph
            && !this.localChannelContextQueue.has(id)
            // Added in attachChannel called by bindChannel
            // Removed when attach op is broadcast
            && !this.pendingAttach.has(id)
        );
    }

    /**
     * Returns the outbound routes of this channel. Currently, all contexts in this channel are considered
     * referenced and are hence outbound. This will change when we have root and non-root channel contexts.
     * The only root contexts will be considered as referenced.
     */
    private getOutboundRoutes(): string[] {
        const outboundRoutes: string[] = [];
        for (const [contextId] of this.contexts) {
            outboundRoutes.push(`${this.absolutePath}/${contextId}`);
        }
        return outboundRoutes;
    }

    /**
     * Updates the GC nodes of this channel. It does the following:
     * - Adds a back route to self to all its child GC nodes.
     * - Adds a node for this channel.
     * @param builder - The builder that contains the GC nodes for this channel's children.
     */
    private updateGCNodes(builder: GCDataBuilder) {
        // Add a back route to self in each child's GC nodes. If any child is referenced, then its parent should
        // be considered referenced as well.
        builder.addRouteToAllNodes(this.absolutePath);

        // Get the outbound routes and add a GC node for this channel.
        builder.addNode("/", this.getOutboundRoutes());
    }

    /**
     * Generates data used for garbage collection. This includes a list of GC nodes that represent this channel
     * including any of its child channel contexts. Each node has a set of outbound routes to other GC nodes in the
     * document. It does the following:
     *
     * 1. Calls into each child context to get its GC data.
     *
     * 2. Prefixes the child context's id to the GC nodes in the child's GC data. This makes sure that the node can be
     * identified as belonging to the child.
     *
     * 3. Adds a GC node for this channel to the nodes received from the children. All these nodes together represent
     * the GC data of this channel.
     *
     * @param fullGC - true to bypass optimizations and force full generation of GC data.
     */
    public async getGCData(fullGC: boolean = false): Promise<IGarbageCollectionData> {
        const builder = new GCDataBuilder();
        // Iterate over each channel context and get their GC data.
        await Promise.all(Array.from(this.contexts)
            .filter(([contextId, _]) => {
                // Get GC data only for attached contexts. Detached contexts are not connected in the GC reference
                // graph so any references they might have won't be connected as well.
                return this.isChannelAttached(contextId);
            }).map(async ([contextId, context]) => {
                const contextGCData = await context.getGCData(fullGC);
                // Prefix the child's id to the ids of its GC nodes so they can be identified as belonging to the child.
                // This also gradually builds the id of each node to be a path from the root.
                builder.prefixAndAddNodes(contextId, contextGCData.gcNodes);
            }));

        this.updateGCNodes(builder);
        return builder.getGCData();
    }

    /**
     * After GC has run, called to notify this channel of routes that are used in it. It calls the child contexts to
     * update their used routes.
     * @param usedRoutes - The routes that are used in all contexts in this channel.
     */
    public updateUsedRoutes(usedRoutes: string[]) {
        // Get a map of channel ids to routes used in it.
        const usedContextRoutes = unpackChildNodesUsedRoutes(usedRoutes);

        // Verify that the used routes are correct.
        for (const [id] of usedContextRoutes) {
            assert(this.contexts.has(id), 0x17e /* "Used route does not belong to any known context" */);
        }

        // Update the used routes in each context. Used routes is empty for unused context.
        for (const [contextId, context] of this.contexts) {
            context.updateUsedRoutes(usedContextRoutes.get(contextId) ?? []);
        }
    }

    /**
     * Called when a new outbound reference is added to another node. This is used by garbage collection to identify
     * all references added in the system.
     * @param srcHandle - The handle of the node that added the reference.
     * @param outboundHandle - The handle of the outbound node that is referenced.
     */
    private addedGCOutboundReference(srcHandle: IFluidHandle, outboundHandle: IFluidHandle) {
        this.dataStoreContext.addedGCOutboundReference?.(srcHandle, outboundHandle);
    }

    /**
     * Returns the base GC details for the channel with the given id. This is used to initialize its GC state.
     * @param channelId - The id of the channel context that is asked for the initial GC details.
     * @returns the requested channel's base GC details.
     */
    private async getChannelBaseGCDetails(channelId: string): Promise<IGarbageCollectionDetailsBase> {
        let channelBaseGCDetails = (await this.channelsBaseGCDetails).get(channelId);
        if (channelBaseGCDetails === undefined) {
            channelBaseGCDetails = {};
        } else if (channelBaseGCDetails.gcData?.gcNodes !== undefined) {
            // Note: if the child channel has an explicit handle route to its parent, it will be removed here and
            // expected to be added back by the parent when getGCData is called.
            removeRouteFromAllNodes(channelBaseGCDetails.gcData.gcNodes, this.absolutePath);
        }

        // Currently, channel context's are always considered used. So, it there are no used routes for it, we still
        // need to mark it as used. Add self-route (empty string) to the channel context's used routes.
        if (channelBaseGCDetails.usedRoutes === undefined || channelBaseGCDetails.usedRoutes.length === 0) {
            channelBaseGCDetails.usedRoutes = [""];
        }
        return channelBaseGCDetails;
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
    ): Promise<ISummaryTreeWithStats> {
        const summaryBuilder = new SummaryTreeBuilder();

        // Iterate over each data store and ask it to summarize
        await Promise.all(Array.from(this.contexts)
            .filter(([contextId, _]) => {
                const isAttached = this.isChannelAttached(contextId);
                // We are not expecting local dds! Summary may not capture local state.
                assert(isAttached, 0x17f /* "Not expecting detached channels during summarize" */);
                // If the object is registered - and we have received the sequenced op creating the object
                // (i.e. it has a base mapping) - then we go ahead and summarize
                return isAttached;
            }).map(async ([contextId, context]) => {
                const contextSummary = await context.summarize(fullTree, trackState, telemetryContext);
                summaryBuilder.addWithStats(contextId, contextSummary);
            }));

        return summaryBuilder.getSummaryTree();
    }

    public getAttachSummary(telemetryContext?: ITelemetryContext): ISummaryTreeWithStats {
        /**
         * back-compat 0.59.1000 - getAttachSummary() is called when making a data store globally visible (previously
         * attaching state). Ideally, attachGraph() should have already be called making it locally visible. However,
         * before visibility state was added, this may not have been the case and getAttachSummary() could be called:
         *
         * 1. Before attaching the data store - When a detached container is attached.
         *
         * 2. After attaching the data store - When a data store is created and bound in an attached container.
         *
         * The basic idea is that all local object should become locally visible before they are globally visible.
         */
        this.attachGraph();

        // This assert cannot be added now due to back-compat. To be uncommented when the following issue is fixed -
        // https://github.com/microsoft/FluidFramework/issues/9688.
        //
        // assert(this.visibilityState === VisibilityState.LocallyVisible,
        //  "The data store should be locally visible when generating attach summary",
        // );

        const summaryBuilder = new SummaryTreeBuilder();

        // Craft the .attributes file for each shared object
        for (const [contextId, context] of this.contexts) {
            if (!(context instanceof LocalChannelContextBase)) {
                throw new LoggingError("Should only be called with local channel handles");
            }

            if (!this.notBoundedChannelContextSet.has(contextId)) {
                let summaryTree: ISummaryTreeWithStats;
                if (context.isLoaded) {
                    const contextSummary = context.getAttachSummary(telemetryContext);
                    assert(
                        contextSummary.summary.type === SummaryType.Tree,
                        0x180 /* "getAttachSummary should always return a tree" */);
                    summaryTree = { stats: contextSummary.stats, summary: contextSummary.summary };
                } else {
                    // If this channel is not yet loaded, then there should be no changes in the snapshot from which
                    // it was created as it is detached container. So just use the previous snapshot.
                    assert(!!this.dataStoreContext.baseSnapshot,
                        0x181 /* "BaseSnapshot should be there as detached container loaded from snapshot" */);
                    summaryTree = convertSnapshotTreeToSummaryTree(this.dataStoreContext.baseSnapshot.trees[contextId]);
                }
                summaryBuilder.addWithStats(contextId, summaryTree);
            }
        }

        return summaryBuilder.getSummaryTree();
    }

    public submitMessage(type: DataStoreMessageType, content: any, localOpMetadata: unknown) {
        this.submit(type, content, localOpMetadata);
    }

    public submitSignal(type: string, content: any) {
        this.verifyNotClosed();
        return this.dataStoreContext.submitSignal(type, content);
    }

    /**
     * Will return when the data store is attached.
     */
    public async waitAttached(): Promise<void> {
        return this.deferredAttached.promise;
    }

    /**
     * Attach channel should only be called after the data store has been attached
     */
    private attachChannel(channel: IChannel): void {
        this.verifyNotClosed();
        // If this handle is already attached no need to attach again.
        if (channel.handle.isAttached) {
            return;
        }

        channel.handle.attachGraph();

        assert(this.isAttached, 0x182 /* "Data store should be attached to attach the channel." */);
        assert(this.visibilityState === VisibilityState.GloballyVisible,
            0x2d0 /* "Data store should be globally visible to attach channels." */);

        const summarizeResult = summarizeChannel(channel, true /* fullTree */, false /* trackState */);
        // Attach message needs the summary in ITree format. Convert the ISummaryTree into an ITree.
        const snapshot = convertSummaryTreeToITree(summarizeResult.summary);

        const message: IAttachMessage = {
            id: channel.id,
            snapshot,
            type: channel.attributes.type,
        };
        this.pendingAttach.set(channel.id, message);
        this.submit(DataStoreMessageType.Attach, message);

        const context = this.contexts.get(channel.id) as LocalChannelContextBase;
        context.makeVisible();
    }

    private submitChannelOp(address: string, contents: any, localOpMetadata: unknown) {
        const envelope: IEnvelope = { address, contents };
        this.submit(DataStoreMessageType.ChannelOp, envelope, localOpMetadata);
    }

    private submit(
        type: DataStoreMessageType,
        content: any,
        localOpMetadata: unknown = undefined): void {
        this.verifyNotClosed();
        this.dataStoreContext.submitMessage(type, content, localOpMetadata);
    }

    /**
     * For messages of type MessageType.Operation, finds the right channel and asks it to resubmit the message.
     * For all other messages, just submit it again.
     * This typically happens when we reconnect and there are unacked messages.
     * @param content - The content of the original message.
     * @param localOpMetadata - The local metadata associated with the original message.
     */
    public reSubmit(type: DataStoreMessageType, content: any, localOpMetadata: unknown) {
        this.verifyNotClosed();

        switch (type) {
            case DataStoreMessageType.ChannelOp:
                {
                    // For Operations, find the right channel and trigger resubmission on it.
                    const envelope = content as IEnvelope;
                    const channelContext = this.contexts.get(envelope.address);
                    assert(!!channelContext, 0x183 /* "There should be a channel context for the op" */);
                    channelContext.reSubmit(envelope.contents, localOpMetadata);
                    break;
                }
            case DataStoreMessageType.Attach:
                // For Attach messages, just submit them again.
                this.submit(type, content, localOpMetadata);
                break;
            default:
                unreachableCase(type);
        }
    }

    /**
     * Revert a local op.
     * @param content - The content of the original message.
     * @param localOpMetadata - The local metadata associated with the original message.
     */
    public rollback?(type: DataStoreMessageType, content: any, localOpMetadata: unknown) {
        this.verifyNotClosed();

        switch (type) {
            case DataStoreMessageType.ChannelOp:
                {
                    // For Operations, find the right channel and trigger resubmission on it.
                    const envelope = content as IEnvelope;
                    const channelContext = this.contexts.get(envelope.address);
                    assert(!!channelContext, 0x2ed /* "There should be a channel context for the op" */);
                    channelContext.rollback(envelope.contents, localOpMetadata);
                    break;
                }
            default:
                throw new LoggingError(`Can't rollback ${type} message`);
        }
    }

    public async applyStashedOp(content: any): Promise<unknown> {
        const envelope = content as IEnvelope;
        const channelContext = this.contexts.get(envelope.address);
        assert(!!channelContext, 0x184 /* "There should be a channel context for the op" */);
        await channelContext.getChannel();
        return channelContext.applyStashedOp(envelope.contents);
    }

    private setChannelDirty(address: string): void {
        this.verifyNotClosed();
        this.dataStoreContext.setChannelDirty(address);
    }

    private processChannelOp(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        this.verifyNotClosed();

        const envelope = message.contents as IEnvelope;

        const transformed: ISequencedDocumentMessage = {
            ...message,
            contents: envelope.contents,
        };

        const channelContext = this.contexts.get(envelope.address);
        assert(!!channelContext, 0x185 /* "Channel not found" */);
        channelContext.processOp(transformed, local, localOpMetadata);

        return channelContext;
    }

    private attachListener() {
        this.setMaxListeners(Number.MAX_SAFE_INTEGER);
        this.dataStoreContext.once("attaching", () => {
            /**
             * back-compat 0.59.1000 - Ideally, attachGraph() should have already been called making the data store
             * locally visible. However, before visibility state was added, this may not have been the case and data
             * store can move to "attaching" state in 2 scenarios:
             * 1) Before attachGraph() is called - When a data store is created and bound in an attached container.
             * 2) After attachGraph() is called - When a detached container is attached.
             *
             * The basic idea is that all local object should become locally visible before they are globally visible.
             */
            this.attachGraph();

            this._attachState = AttachState.Attaching;

            assert(this.visibilityState === VisibilityState.LocallyVisible,
                0x2d1 /* "Data store should be locally visible before it can become globally visible." */);

            // Mark the data store globally visible and make its child channels visible as well.
            this.visibilityState = VisibilityState.GloballyVisible;
            this.localChannelContextQueue.forEach((channel) => {
                channel.makeVisible();
            });
            this.localChannelContextQueue.clear();

            // This promise resolution will be moved to attached event once we fix the scheduler.
            this.deferredAttached.resolve();
            this.emit("attaching");
        });
        this.dataStoreContext.once("attached", () => {
            assert(this.visibilityState === VisibilityState.GloballyVisible,
                0x2d2 /* "Data store should be globally visible when its attached." */);
            this._attachState = AttachState.Attached;
            this.emit("attached");
        });
    }

    private verifyNotClosed() {
        if (this._disposed) {
            throw new LoggingError("Runtime is closed");
        }
    }
}

/**
 * Mixin class that adds request handler to FluidDataStoreRuntime
 * Request handler is only called when data store can't resolve request, i.e. for custom requests.
 * @param Base - base class, inherits from FluidDataStoreRuntime
 * @param requestHandler - request handler to mix in
 */
export const mixinRequestHandler = (
    requestHandler: (request: IRequest, runtime: FluidDataStoreRuntime) => Promise<IResponse>,
    Base: typeof FluidDataStoreRuntime = FluidDataStoreRuntime,
) => class RuntimeWithRequestHandler extends Base {
        public async request(request: IRequest) {
            const response = await super.request(request);
            if (response.status === 404) {
                return requestHandler(request, this);
            }
            return response;
        }
    } as typeof FluidDataStoreRuntime;

/**
 * Mixin class that adds await for DataObject to finish initialization before we proceed to summary.
 * @param handler - handler that returns info about blob to be added to summary.
 * Or undefined not to add anything to summary.
 * @param Base - base class, inherits from FluidDataStoreRuntime
 */
export const mixinSummaryHandler = (
    handler: (runtime: FluidDataStoreRuntime) => Promise<{ path: string[]; content: string; } | undefined >,
    Base: typeof FluidDataStoreRuntime = FluidDataStoreRuntime,
) => class RuntimeWithSummarizerHandler extends Base {
        private addBlob(summary: ISummaryTreeWithStats, path: string[], content: string) {
            const firstName = path.shift();
            if (firstName === undefined) {
                throw new LoggingError("Path can't be empty");
            }

            let blob: ISummaryTree | ISummaryBlob = {
                type: SummaryType.Blob,
                content,
            };
            summary.stats.blobNodeCount++;
            summary.stats.totalBlobSize += content.length;

            for (const name of path.reverse()) {
                blob = {
                    type: SummaryType.Tree,
                    tree: { [name]: blob },
                };
                summary.stats.treeNodeCount++;
            }
            summary.summary.tree[firstName] = blob;
        }

        async summarize(...args: any[]) {
            const summary = await super.summarize(...args);
            const content = await handler(this);
            if (content !== undefined) {
                this.addBlob(summary, content.path, content.content);
            }
            return summary;
        }
    } as typeof FluidDataStoreRuntime;
