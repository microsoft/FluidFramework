/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { EventEmitter } from "events";
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
    ContainerWarning,
    ILoader,
    BindState,
    AttachState,
} from "@fluidframework/container-definitions";
import {
    Deferred,
    unreachableCase,
} from "@fluidframework/common-utils";
import {
    ChildLogger,
    raiseConnectedEvent,
} from "@fluidframework/telemetry-utils";
import { buildSnapshotTree } from "@fluidframework/driver-utils";
import { TreeTreeEntry } from "@fluidframework/protocol-base";
import {
    IClientDetails,
    IDocumentMessage,
    IQuorum,
    ISequencedDocumentMessage,
    ITreeEntry,
} from "@fluidframework/protocol-definitions";
import {
    IAttachMessage,
    IFluidDataStoreContext,
    IFluidDataStoreRegistry,
    IFluidDataStoreChannel,
    IEnvelope,
    IInboundSignalMessage,
    ISummaryTreeWithStats,
    CreateSummarizerNodeSource,
} from "@fluidframework/runtime-definitions";
import { generateHandleContextPath, SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { IChannel, IFluidDataStoreRuntime, IChannelFactory } from "@fluidframework/datastore-definitions";
import { v4 as uuid } from "uuid";
import { IChannelContext, snapshotChannel } from "./channelContext";
import { LocalChannelContext } from "./localChannelContext";
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
export class FluidDataStoreRuntime extends EventEmitter implements IFluidDataStoreChannel,
    IFluidDataStoreRuntime, IFluidHandleContext {
    /**
     * Loads the data store runtime
     * @param context - The data store context
     * @param sharedObjectRegistry - The registry of shared objects used by this data store
     * @param activeCallback - The callback called when the data store runtime in active
     * @param dataStoreRegistry - The registry of data store created and used by this data store
     */
    public static load(
        context: IFluidDataStoreContext,
        sharedObjectRegistry: ISharedObjectRegistry,
        dataStoreRegistry?: IFluidDataStoreRegistry,
    ): FluidDataStoreRuntime {
        const logger = ChildLogger.create(context.containerRuntime.logger, undefined, { dataStoreId: uuid() });
        const runtime = new FluidDataStoreRuntime(
            context,
            context.documentId,
            context.id,
            context.parentBranch,
            context.existing,
            context.options,
            context.deltaManager,
            context.getQuorum(),
            context.getAudience(),
            context.snapshotFn,
            sharedObjectRegistry,
            dataStoreRegistry,
            logger);

        context.bindRuntime(runtime);
        return runtime;
    }

    public get IFluidRouter() { return this; }

    public get connected(): boolean {
        return this.dataStoreContext.connected;
    }

    public get leader(): boolean {
        return this.dataStoreContext.leader;
    }

    public get clientId(): string | undefined {
        return this.dataStoreContext.clientId;
    }

    public get clientDetails(): IClientDetails {
        return this.dataStoreContext.containerRuntime.clientDetails;
    }

    public get loader(): ILoader {
        return this.dataStoreContext.loader;
    }

    public get isAttached(): boolean {
        return this.attachState !== AttachState.Detached;
    }

    public get attachState(): AttachState {
        return this._attachState;
    }

    /**
     * @deprecated - 0.21 back-compat
     */
    public get path(): string {
        return this.id;
    }

    public get absolutePath(): string {
        return generateHandleContextPath(this.id, this.routeContext);
    }

    public get routeContext(): IFluidHandleContext {
        return this.dataStoreContext.containerRuntime.IFluidHandleContext;
    }

    public get IFluidSerializer() { return this.dataStoreContext.containerRuntime.IFluidSerializer; }

    public get IFluidHandleContext() { return this; }
    public get IFluidDataStoreRegistry() { return this.dataStoreRegistry; }

    private _disposed = false;
    public get disposed() { return this._disposed; }

    private readonly contexts = new Map<string, IChannelContext>();
    private readonly contextsDeferred = new Map<string, Deferred<IChannelContext>>();
    private readonly pendingAttach = new Map<string, IAttachMessage>();
    private requestHandler: ((request: IRequest) => Promise<IResponse>) | undefined;
    private bindState: BindState;
    // This is used to break the recursion while attaching the graph. Also tells the attach state of the graph.
    private graphAttachState: AttachState = AttachState.Detached;
    private readonly deferredAttached = new Deferred<void>();
    private readonly localChannelContextQueue = new Map<string, LocalChannelContext>();
    private readonly notBoundedChannelContextSet = new Set<string>();
    private boundhandles: Set<IFluidHandle> | undefined;
    private _attachState: AttachState;

    private constructor(
        private readonly dataStoreContext: IFluidDataStoreContext,
        public readonly documentId: string,
        public readonly id: string,
        public readonly parentBranch: string | null,
        public existing: boolean,
        public readonly options: any,
        public readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        private readonly quorum: IQuorum,
        private readonly audience: IAudience,
        private readonly snapshotFn: (message: string) => Promise<void>,
        private readonly sharedObjectRegistry: ISharedObjectRegistry,
        private readonly dataStoreRegistry: IFluidDataStoreRegistry | undefined,
        public readonly logger: ITelemetryLogger,
    ) {
        super();

        const tree = dataStoreContext.baseSnapshot;

        // Must always receive the data store type inside of the attributes
        if (tree?.trees !== undefined) {
            Object.keys(tree.trees).forEach((path) => {
                const channelContext = new RemoteChannelContext(
                    this,
                    dataStoreContext,
                    dataStoreContext.storage,
                    (content, localOpMetadata) => this.submitChannelOp(path, content, localOpMetadata),
                    (address: string) => this.setChannelDirty(address),
                    path,
                    tree.trees[path],
                    this.sharedObjectRegistry,
                    undefined /* extraBlobs */,
                    dataStoreContext.branch,
                    this.dataStoreContext.summaryTracker.createOrGetChild(
                        path,
                        this.deltaManager.lastSequenceNumber,
                    ),
                    this.dataStoreContext.getCreateChildSummarizerNodeFn(
                        path,
                        { type: CreateSummarizerNodeSource.FromSummary },
                    ));
                const deferred = new Deferred<IChannelContext>();
                deferred.resolve(channelContext);

                this.contexts.set(path, channelContext);
                this.contextsDeferred.set(path, deferred);
            });
        }

        this.attachListener();
        this.bindState = existing ? BindState.Bound : BindState.NotBound;
        this._attachState = existing ? AttachState.Attached : AttachState.Detached;

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
    }

    public async resolveHandle(request: IRequest): Promise<IResponse> {
        return this.request(request);
    }

    public async request(request: IRequest): Promise<IResponse> {
        // Parse out the leading slash
        const id = request.url.startsWith("/") ? request.url.substr(1) : request.url;

        // Check for a data type reference first
        if (this.contextsDeferred.has(id)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const value = await this.contextsDeferred.get(id)!.promise;
            const channel = await value.getChannel();

            return { mimeType: "fluid/object", status: 200, value: channel };
        }

        // Otherwise defer to an attached request handler
        if (this.requestHandler === undefined) {
            return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
        } else {
            return this.requestHandler(request);
        }
    }

    public registerRequestHandler(handler: (request: IRequest) => Promise<IResponse>) {
        this.requestHandler = handler;
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
        this.verifyNotClosed();

        assert(!this.contexts.has(id), "createChannel() with existing ID");
        this.notBoundedChannelContextSet.add(id);
        const context = new LocalChannelContext(
            id,
            this.sharedObjectRegistry,
            type,
            this,
            this.dataStoreContext,
            this.dataStoreContext.storage,
            (content, localOpMetadata) => this.submitChannelOp(id, content, localOpMetadata),
            (address: string) => this.setChannelDirty(address));
        this.contexts.set(id, context);

        if (this.contextsDeferred.has(id)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.contextsDeferred.get(id)!.resolve(context);
        } else {
            const deferred = new Deferred<IChannelContext>();
            deferred.resolve(context);
            this.contextsDeferred.set(id, deferred);
        }

        return context.channel;
    }

    /**
     * Binds a channel with the runtime. If the runtime is attached we will attach the channel right away.
     * If the runtime is not attached we will defer the attach until the runtime attaches.
     * @param channel - channel to be registered.
     */
    public bindChannel(channel: IChannel): void {
        assert(this.notBoundedChannelContextSet.has(channel.id), "Channel to be binded should be in not bounded set");
        this.notBoundedChannelContextSet.delete(channel.id);
        // If our data store is attached, then attach the channel.
        if (this.isAttached) {
            this.attachChannel(channel);
            return;
        } else {
            this.bind(channel.handle);

            // If our data store is local then add the channel to the queue
            if (!this.localChannelContextQueue.has(channel.id)) {
                this.localChannelContextQueue.set(channel.id, this.contexts.get(channel.id) as LocalChannelContext);
            }
        }
    }

    public attachGraph() {
        if (this.graphAttachState !== AttachState.Detached) {
            return;
        }
        this.graphAttachState = AttachState.Attaching;
        if (this.boundhandles !== undefined) {
            this.boundhandles.forEach((handle) => {
                handle.attachGraph();
            });
            this.boundhandles = undefined;
        }

        // Flush the queue to set any pre-existing channels to local
        this.localChannelContextQueue.forEach((channel) => {
            // When we are attaching the data store we don't need to send attach for the registered services.
            // This is because they will be captured as part of the Attach data store snapshot
            channel.attach();
        });

        this.localChannelContextQueue.clear();
        this.bindToContext();
        this.graphAttachState = AttachState.Attached;
    }

    /**
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
        // Attach the runtime to the container via this callback
        this.dataStoreContext.bindToContext(this);

        this.bindState = BindState.Bound;
    }

    public bind(handle: IFluidHandle): void {
        // If the data store is already attached or its graph is already in attaching or attached state,
        // then attach the incoming handle too.
        if (this.isAttached || this.graphAttachState !== AttachState.Detached) {
            handle.attachGraph();
            return;
        }
        if (this.boundhandles === undefined) {
            this.boundhandles = new Set<IFluidHandle>();
        }

        this.boundhandles.add(handle);
    }

    public setConnectionState(connected: boolean, clientId?: string) {
        this.verifyNotClosed();

        for (const [, object] of this.contexts) {
            object.setConnectionState(connected, clientId);
        }

        raiseConnectedEvent(this.logger, this, connected, clientId);
    }

    public getQuorum(): IQuorum {
        return this.quorum;
    }

    public getAudience(): IAudience {
        return this.audience;
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public snapshot(message: string): Promise<void> {
        this.verifyNotClosed();
        return this.snapshotFn(message);
    }

    public async uploadBlob(file: Buffer): Promise<IFluidHandle<string>> {
        this.verifyNotClosed();

        return this.dataStoreContext.uploadBlob(file);
    }

    public process(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        this.verifyNotClosed();
        switch (message.type) {
            case DataStoreMessageType.Attach: {
                const attachMessage = message.contents as IAttachMessage;
                const id = attachMessage.id;

                // If a non-local operation then go and create the object
                // Otherwise mark it as officially attached.
                if (local) {
                    assert(this.pendingAttach.has(id), "Unexpected attach (local) channel OP");
                    this.pendingAttach.delete(id);
                } else {
                    assert(!this.contexts.has(id), "Unexpected attach channel OP");

                    // Create storage service that wraps the attach data
                    const origin = message.origin?.id ?? this.documentId;

                    const flatBlobs = new Map<string, string>();
                    const snapshotTreeP = buildSnapshotTree(attachMessage.snapshot.entries, flatBlobs);
                    // flatBlobsP's validity is contingent on snapshotTreeP's resolution
                    const flatBlobsP = snapshotTreeP.then((snapshotTree) => { return flatBlobs; });

                    const remoteChannelContext = new RemoteChannelContext(
                        this,
                        this.dataStoreContext,
                        this.dataStoreContext.storage,
                        (content, localContentMetadata) => this.submitChannelOp(id, content, localContentMetadata),
                        (address: string) => this.setChannelDirty(address),
                        id,
                        snapshotTreeP,
                        this.sharedObjectRegistry,
                        flatBlobsP,
                        origin,
                        this.dataStoreContext.summaryTracker.createOrGetChild(
                            id,
                            message.sequenceNumber,
                        ),
                        this.dataStoreContext.getCreateChildSummarizerNodeFn(
                            id,
                            {
                                type: CreateSummarizerNodeSource.FromAttach,
                                sequenceNumber: message.sequenceNumber,
                                snapshot: attachMessage.snapshot,
                            },
                        ),
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

    public async snapshotInternal(fullTree: boolean = false): Promise<ITreeEntry[]> {
        // Craft the .attributes file for each shared object
        const entries = await Promise.all(Array.from(this.contexts)
            .filter(([key, _]) => {
                const isAttached = this.isChannelAttached(key);
                // We are not expecting local dds! Summary may not capture local state.
                assert(isAttached, "Not expecting detached channels during summarize");
                // If the object is registered - and we have received the sequenced op creating the object
                // (i.e. it has a base mapping) - then we go ahead and snapshot
                return isAttached;
            }).map(async ([key, value]) => {
                const snapshot = await value.snapshot(fullTree);

                // And then store the tree
                return new TreeTreeEntry(key, snapshot);
            }));

        return entries;
    }

    public async summarize(fullTree = false): Promise<ISummaryTreeWithStats> {
        const builder = new SummaryTreeBuilder();

        // Iterate over each component and ask it to snapshot
        await Promise.all(Array.from(this.contexts)
            .filter(([key, _]) => {
                const isAttached = this.isChannelAttached(key);
                // We are not expecting local dds! Summary may not capture local state.
                assert(isAttached, "Not expecting detached channels during summarize");
                // If the object is registered - and we have received the sequenced op creating the object
                // (i.e. it has a base mapping) - then we go ahead and snapshot
                return isAttached;
            }).map(async ([key, value]) => {
                const channelSummary = await value.summarize(fullTree);
                builder.addWithStats(key, channelSummary);
            }));

        return builder.getSummaryTree();
    }

    public getAttachSnapshot(): ITreeEntry[] {
        const entries: ITreeEntry[] = [];
        this.attachGraph();

        // Craft the .attributes file for each shared object
        for (const [objectId, value] of this.contexts) {
            if (!(value instanceof LocalChannelContext)) {
                throw new Error("Should only be called with local channel handles");
            }

            if (!this.notBoundedChannelContextSet.has(objectId)) {
                const snapshot = value.getAttachSnapshot();

                // And then store the tree
                entries.push(new TreeTreeEntry(objectId, snapshot));
            }
        }

        return entries;
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

    public raiseContainerWarning(warning: ContainerWarning): void {
        this.dataStoreContext.raiseContainerWarning(warning);
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

        assert(this.isAttached, "Data store should be attached to attach the channel.");
        // Get the object snapshot only if the data store is Bound and its graph is attached too,
        // because if the graph is attaching, then it would get included in the data store snapshot.
        if (this.bindState === BindState.Bound && this.graphAttachState === AttachState.Attached) {
            const snapshot = snapshotChannel(channel);

            const message: IAttachMessage = {
                id: channel.id,
                snapshot,
                type: channel.attributes.type,
            };
            this.pendingAttach.set(channel.id, message);
            this.submit(DataStoreMessageType.Attach, message);
        }

        const context = this.contexts.get(channel.id) as LocalChannelContext;
        context.attach();
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
                    assert(channelContext, "There should be a channel context for the op");
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
        assert(channelContext, "Channel not found");
        channelContext.processOp(transformed, local, localOpMetadata);

        return channelContext;
    }

    private attachListener() {
        this.setMaxListeners(Number.MAX_SAFE_INTEGER);
        this.dataStoreContext.on("leader", () => {
            this.emit("leader");
        });
        this.dataStoreContext.on("notleader", () => {
            this.emit("notleader");
        });
        this.dataStoreContext.once("attaching", () => {
            assert(this.bindState !== BindState.NotBound, "Data store attaching should not occur if it is not bound");
            this._attachState = AttachState.Attaching;
            // This promise resolution will be moved to attached event once we fix the scheduler.
            this.deferredAttached.resolve();
            this.emit("attaching");
        });
        this.dataStoreContext.once("attached", () => {
            assert(this.bindState === BindState.Bound, "Data store should only be attached after it is bound");
            this._attachState = AttachState.Attached;
            this.emit("attached");
        });
    }

    private verifyNotClosed() {
        if (this._disposed) {
            throw new Error("Runtime is closed");
        }
    }
}
