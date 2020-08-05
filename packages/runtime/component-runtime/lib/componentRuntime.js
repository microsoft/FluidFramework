/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { EventEmitter } from "events";
import { BindState, AttachState, } from "@fluidframework/container-definitions";
import { Deferred, unreachableCase, } from "@fluidframework/common-utils";
import { ChildLogger, raiseConnectedEvent, } from "@fluidframework/telemetry-utils";
import { buildSnapshotTree } from "@fluidframework/driver-utils";
import { TreeTreeEntry } from "@fluidframework/protocol-base";
import { SchedulerType, CreateSummarizerNodeSource, } from "@fluidframework/runtime-definitions";
import { generateHandleContextPath, SummaryTreeBuilder } from "@fluidframework/runtime-utils";
import { v4 as uuid } from "uuid";
import { snapshotChannel } from "./channelContext";
import { LocalChannelContext } from "./localChannelContext";
import { RemoteChannelContext } from "./remoteChannelContext";
export var ComponentMessageType;
(function (ComponentMessageType) {
    // Creates a new channel
    ComponentMessageType["Attach"] = "attach";
    ComponentMessageType["ChannelOp"] = "op";
})(ComponentMessageType || (ComponentMessageType = {}));
/**
 * Base component class
 */
export class FluidDataStoreRuntime extends EventEmitter {
    constructor(componentContext, documentId, id, parentBranch, existing, options, blobManager, deltaManager, quorum, audience, snapshotFn, sharedObjectRegistry, componentRegistry, logger) {
        var _a;
        super();
        this.componentContext = componentContext;
        this.documentId = documentId;
        this.id = id;
        this.parentBranch = parentBranch;
        this.existing = existing;
        this.options = options;
        this.blobManager = blobManager;
        this.deltaManager = deltaManager;
        this.quorum = quorum;
        this.audience = audience;
        this.snapshotFn = snapshotFn;
        this.sharedObjectRegistry = sharedObjectRegistry;
        this.componentRegistry = componentRegistry;
        this.logger = logger;
        this._disposed = false;
        this.contexts = new Map();
        this.contextsDeferred = new Map();
        this.pendingAttach = new Map();
        // This is used to break the recursion while attaching the graph. Also tells the attach state of the graph.
        this.graphAttachState = AttachState.Detached;
        this.deferredAttached = new Deferred();
        this.localChannelContextQueue = new Map();
        this.notBoundedChannelContextSet = new Set();
        const tree = componentContext.baseSnapshot;
        // Must always receive the component type inside of the attributes
        if (((_a = tree) === null || _a === void 0 ? void 0 : _a.trees) !== undefined) {
            Object.keys(tree.trees).forEach((path) => {
                const channelContext = new RemoteChannelContext(this, componentContext, componentContext.storage, (content, localOpMetadata) => this.submitChannelOp(path, content, localOpMetadata), (address) => this.setChannelDirty(address), path, tree.trees[path], this.sharedObjectRegistry, undefined /* extraBlobs */, componentContext.branch, this.componentContext.summaryTracker.createOrGetChild(path, this.deltaManager.lastSequenceNumber), this.componentContext.getCreateChildSummarizerNodeFn(path, { type: CreateSummarizerNodeSource.FromSummary }));
                const deferred = new Deferred();
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
    /**
     * Loads the component runtime
     * @param context - The component context
     * @param sharedObjectRegistry - The registry of shared objects used by this component
     * @param activeCallback - The callback called when the component runtime in active
     * @param componentRegistry - The registry of components created and used by this component
     */
    static load(context, sharedObjectRegistry, componentRegistry) {
        const logger = ChildLogger.create(context.containerRuntime.logger, undefined, { componentId: uuid() });
        const runtime = new FluidDataStoreRuntime(context, context.documentId, context.id, context.parentBranch, context.existing, context.options, context.blobManager, context.deltaManager, context.getQuorum(), context.getAudience(), context.snapshotFn, sharedObjectRegistry, componentRegistry, logger);
        context.bindRuntime(runtime);
        return runtime;
    }
    get IFluidRouter() { return this; }
    get connected() {
        return this.componentContext.connected;
    }
    get leader() {
        return this.componentContext.leader;
    }
    get clientId() {
        return this.componentContext.clientId;
    }
    get clientDetails() {
        return this.componentContext.containerRuntime.clientDetails;
    }
    get loader() {
        return this.componentContext.loader;
    }
    get isAttached() {
        return this.attachState !== AttachState.Detached;
    }
    get attachState() {
        return this._attachState;
    }
    /**
     * @deprecated - 0.21 back-compat
     */
    get path() {
        return this.id;
    }
    get absolutePath() {
        return generateHandleContextPath(this.id, this.routeContext);
    }
    get routeContext() {
        return this.componentContext.containerRuntime.IFluidHandleContext;
    }
    get IFluidSerializer() { return this.componentContext.containerRuntime.IFluidSerializer; }
    get IFluidHandleContext() { return this; }
    get IFluidDataStoreRegistry() { return this.componentRegistry; }
    get disposed() { return this._disposed; }
    dispose() {
        if (this._disposed) {
            return;
        }
        this._disposed = true;
        this.emit("dispose");
    }
    async request(request) {
        // System routes
        if (request.url === `/${SchedulerType}`) {
            return this.componentContext.containerRuntime.request(request);
        }
        // Parse out the leading slash
        const id = request.url.startsWith("/") ? request.url.substr(1) : request.url;
        // Check for a data type reference first
        if (this.contextsDeferred.has(id)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const value = await this.contextsDeferred.get(id).promise;
            const channel = await value.getChannel();
            return { mimeType: "fluid/object", status: 200, value: channel };
        }
        // Otherwise defer to an attached request handler
        if (this.requestHandler === undefined) {
            return { status: 404, mimeType: "text/plain", value: `${request.url} not found` };
        }
        else {
            return this.requestHandler(request);
        }
    }
    registerRequestHandler(handler) {
        this.requestHandler = handler;
    }
    async getChannel(id) {
        this.verifyNotClosed();
        // TODO we don't assume any channels (even root) in the runtime. If you request a channel that doesn't exist
        // we will never resolve the promise. May want a flag to getChannel that doesn't wait for the promise if
        // it doesn't exist
        if (!this.contextsDeferred.has(id)) {
            this.contextsDeferred.set(id, new Deferred());
        }
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const context = await this.contextsDeferred.get(id).promise;
        const channel = await context.getChannel();
        return channel;
    }
    createChannel(id = uuid(), type) {
        this.verifyNotClosed();
        assert(!this.contexts.has(id), "createChannel() with existing ID");
        this.notBoundedChannelContextSet.add(id);
        const context = new LocalChannelContext(id, this.sharedObjectRegistry, type, this, this.componentContext, this.componentContext.storage, (content, localOpMetadata) => this.submitChannelOp(id, content, localOpMetadata), (address) => this.setChannelDirty(address));
        this.contexts.set(id, context);
        if (this.contextsDeferred.has(id)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.contextsDeferred.get(id).resolve(context);
        }
        else {
            const deferred = new Deferred();
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
    bindChannel(channel) {
        assert(this.notBoundedChannelContextSet.has(channel.id), "Channel to be binded should be in not bounded set");
        this.notBoundedChannelContextSet.delete(channel.id);
        // If our Component is attached, then attach the channel.
        if (this.isAttached) {
            this.attachChannel(channel);
            return;
        }
        else {
            this.bind(channel.handle);
            // If our Component is local then add the channel to the queue
            if (!this.localChannelContextQueue.has(channel.id)) {
                this.localChannelContextQueue.set(channel.id, this.contexts.get(channel.id));
            }
        }
    }
    attachGraph() {
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
            // When we are attaching the component we don't need to send attach for the registered services.
            // This is because they will be captured as part of the Attach component snapshot
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
     * 2. Attaching the graph if the component becomes attached.
     */
    bindToContext() {
        if (this.bindState !== BindState.NotBound) {
            return;
        }
        this.bindState = BindState.Binding;
        // Attach the runtime to the container via this callback
        this.componentContext.bindToContext(this);
        this.bindState = BindState.Bound;
    }
    bind(handle) {
        // If the component is already attached or its graph is already in attaching or attached state,
        // then attach the incoming handle too.
        if (this.isAttached || this.graphAttachState !== AttachState.Detached) {
            handle.attachGraph();
            return;
        }
        if (this.boundhandles === undefined) {
            this.boundhandles = new Set();
        }
        this.boundhandles.add(handle);
    }
    setConnectionState(connected, clientId) {
        this.verifyNotClosed();
        for (const [, object] of this.contexts) {
            object.setConnectionState(connected, clientId);
        }
        raiseConnectedEvent(this.logger, this, connected, clientId);
    }
    getQuorum() {
        return this.quorum;
    }
    getAudience() {
        return this.audience;
    }
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    snapshot(message) {
        this.verifyNotClosed();
        return this.snapshotFn(message);
    }
    async uploadBlob(file) {
        this.verifyNotClosed();
        const blob = await this.blobManager.createBlob(file);
        file.id = blob.id;
        file.url = blob.url;
        return file;
    }
    // eslint-disable-next-line @typescript-eslint/promise-function-async
    getBlob(blobId) {
        this.verifyNotClosed();
        return this.blobManager.getBlob(blobId);
    }
    async getBlobMetadata() {
        return this.blobManager.getBlobMetadata();
    }
    process(message, local, localOpMetadata) {
        var _a, _b;
        this.verifyNotClosed();
        switch (message.type) {
            case ComponentMessageType.Attach: {
                const attachMessage = message.contents;
                const id = attachMessage.id;
                // If a non-local operation then go and create the object
                // Otherwise mark it as officially attached.
                if (local) {
                    assert(this.pendingAttach.has(id), "Unexpected attach (local) channel OP");
                    this.pendingAttach.delete(id);
                }
                else {
                    assert(!this.contexts.has(id), "Unexpected attach channel OP");
                    // Create storage service that wraps the attach data
                    const origin = (_b = (_a = message.origin) === null || _a === void 0 ? void 0 : _a.id, (_b !== null && _b !== void 0 ? _b : this.documentId));
                    const flatBlobs = new Map();
                    const snapshotTreeP = buildSnapshotTree(attachMessage.snapshot.entries, flatBlobs);
                    // flatBlobsP's validity is contingent on snapshotTreeP's resolution
                    const flatBlobsP = snapshotTreeP.then((snapshotTree) => { return flatBlobs; });
                    const remoteChannelContext = new RemoteChannelContext(this, this.componentContext, this.componentContext.storage, (content, localContentMetadata) => this.submitChannelOp(id, content, localContentMetadata), (address) => this.setChannelDirty(address), id, snapshotTreeP, this.sharedObjectRegistry, flatBlobsP, origin, this.componentContext.summaryTracker.createOrGetChild(id, message.sequenceNumber), this.componentContext.getCreateChildSummarizerNodeFn(id, {
                        type: CreateSummarizerNodeSource.FromAttach,
                        sequenceNumber: message.sequenceNumber,
                        snapshot: attachMessage.snapshot,
                    }), attachMessage.type);
                    this.contexts.set(id, remoteChannelContext);
                    if (this.contextsDeferred.has(id)) {
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        this.contextsDeferred.get(id).resolve(remoteChannelContext);
                    }
                    else {
                        const deferred = new Deferred();
                        deferred.resolve(remoteChannelContext);
                        this.contextsDeferred.set(id, deferred);
                    }
                }
                break;
            }
            case ComponentMessageType.ChannelOp:
                this.processChannelOp(message, local, localOpMetadata);
                break;
            default:
        }
        this.emit("op", message);
    }
    processSignal(message, local) {
        this.emit("signal", message, local);
    }
    isChannelAttached(id) {
        return (
        // Added in createChannel
        // Removed when bindChannel is called
        !this.notBoundedChannelContextSet.has(id)
            // Added in bindChannel only if this is not attached yet
            // Removed when this is attached by calling attachGraph
            && !this.localChannelContextQueue.has(id)
            // Added in attachChannel called by bindChannel
            // Removed when attach op is broadcast
            && !this.pendingAttach.has(id));
    }
    async snapshotInternal(fullTree = false) {
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
    async summarize(fullTree = false) {
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
    getAttachSnapshot() {
        const entries = [];
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
    submitMessage(type, content, localOpMetadata) {
        this.submit(type, content, localOpMetadata);
    }
    submitSignal(type, content) {
        this.verifyNotClosed();
        return this.componentContext.submitSignal(type, content);
    }
    /**
     * Will return when the component is attached.
     */
    async waitAttached() {
        return this.deferredAttached.promise;
    }
    raiseContainerWarning(warning) {
        this.componentContext.raiseContainerWarning(warning);
    }
    /**
     * Attach channel should only be called after the componentRuntime has been attached
     */
    attachChannel(channel) {
        this.verifyNotClosed();
        // If this handle is already attached no need to attach again.
        if (channel.handle.isAttached) {
            return;
        }
        channel.handle.attachGraph();
        assert(this.isAttached, "Component should be attached to attach the channel.");
        // Get the object snapshot only if the component is Bound and its graph is attached too,
        // because if the graph is attaching, then it would get included in the component snapshot.
        if (this.bindState === BindState.Bound && this.graphAttachState === AttachState.Attached) {
            const snapshot = snapshotChannel(channel);
            const message = {
                id: channel.id,
                snapshot,
                type: channel.attributes.type,
            };
            this.pendingAttach.set(channel.id, message);
            this.submit(ComponentMessageType.Attach, message);
        }
        const context = this.contexts.get(channel.id);
        context.attach();
    }
    submitChannelOp(address, contents, localOpMetadata) {
        const envelope = { address, contents };
        this.submit(ComponentMessageType.ChannelOp, envelope, localOpMetadata);
    }
    submit(type, content, localOpMetadata = undefined) {
        this.verifyNotClosed();
        this.componentContext.submitMessage(type, content, localOpMetadata);
    }
    /**
     * For messages of type MessageType.Operation, finds the right channel and asks it to resubmit the message.
     * For all other messages, just submit it again.
     * This typically happens when we reconnect and there are unacked messages.
     * @param content - The content of the original message.
     * @param localOpMetadata - The local metadata associated with the original message.
     */
    reSubmit(type, content, localOpMetadata) {
        this.verifyNotClosed();
        switch (type) {
            case ComponentMessageType.ChannelOp:
                {
                    // For Operations, find the right channel and trigger resubmission on it.
                    const envelope = content;
                    const channelContext = this.contexts.get(envelope.address);
                    assert(channelContext, "There should be a channel context for the op");
                    channelContext.reSubmit(envelope.contents, localOpMetadata);
                    break;
                }
            case ComponentMessageType.Attach:
                // For Attach messages, just submit them again.
                this.submit(type, content, localOpMetadata);
                break;
            default:
                unreachableCase(type);
        }
    }
    setChannelDirty(address) {
        this.verifyNotClosed();
        this.componentContext.setChannelDirty(address);
    }
    processChannelOp(message, local, localOpMetadata) {
        this.verifyNotClosed();
        const envelope = message.contents;
        const transformed = Object.assign(Object.assign({}, message), { contents: envelope.contents });
        const channelContext = this.contexts.get(envelope.address);
        assert(channelContext, "Channel not found");
        channelContext.processOp(transformed, local, localOpMetadata);
        return channelContext;
    }
    attachListener() {
        this.setMaxListeners(Number.MAX_SAFE_INTEGER);
        this.componentContext.on("leader", () => {
            this.emit("leader");
        });
        this.componentContext.on("notleader", () => {
            this.emit("notleader");
        });
        this.componentContext.once("attaching", () => {
            assert(this.bindState !== BindState.NotBound, "Component attaching should not occur if it is not bound");
            this._attachState = AttachState.Attaching;
            // This promise resolution will be moved to attached event once we fix the scheduler.
            this.deferredAttached.resolve();
            this.emit("attaching");
        });
        this.componentContext.once("attached", () => {
            assert(this.bindState === BindState.Bound, "Component should only be attached after it is bound");
            this._attachState = AttachState.Attached;
            this.emit("attached");
        });
    }
    verifyNotClosed() {
        if (this._disposed) {
            throw new Error("Runtime is closed");
        }
    }
}
//# sourceMappingURL=componentRuntime.js.map