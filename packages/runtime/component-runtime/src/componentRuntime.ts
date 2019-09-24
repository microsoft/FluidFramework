/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IComponentHandle, IComponentHandleContext, IRequest, IResponse } from "@microsoft/fluid-component-core-interfaces";
import {
    ConnectionState,
    IAudience,
    IBlobManager,
    IDeltaManager,
    IGenericBlob,
    ILoader,
    IQuorum,
    ITelemetryLogger,
} from "@microsoft/fluid-container-definitions";
import { buildHierarchy, ChildLogger, Deferred, flatten, raiseConnectedEvent } from "@microsoft/fluid-core-utils";
import {
    FileMode,
    IDocumentMessage,
    ISequencedDocumentMessage,
    ITreeEntry,
    MessageType,
    TreeEntry,
} from "@microsoft/fluid-protocol-definitions";
import {
    IAttachMessage,
    IChannel,
    IComponentContext,
    IComponentRuntime,
    IEnvelope,
    IInboundSignalMessage,
} from "@microsoft/fluid-runtime-definitions";
import { ISharedObjectFactory } from "@microsoft/fluid-shared-object-base";
import * as assert from "assert";
import { EventEmitter } from "events";
import { IChannelContext } from "./channelContext";
import { LocalChannelContext } from "./localChannelContext";
import { RemoteChannelContext } from "./remoteChannelContext";

export interface ISharedObjectRegistry {
    // TODO consider making this async. A consequence is that either the creation of a distributed data type
    // is async or we need a new API to split the synchronous vs. asynchronous creation.
    get(name: string): ISharedObjectFactory | undefined;
}

/**
 * Base component class
 */
export class ComponentRuntime extends EventEmitter implements IComponentRuntime, IComponentHandleContext {
    public static load(
        context: IComponentContext,
        registry: ISharedObjectRegistry,
        activeCallback: (runtime: ComponentRuntime) => void,
    ): void {
        const logger = ChildLogger.create(context.hostRuntime.logger, undefined, { componentId: context.id });
        const runtime = new ComponentRuntime(
            context,
            context.documentId,
            context.id,
            context.parentBranch,
            context.existing,
            context.options,
            context.blobManager,
            context.deltaManager,
            context.getQuorum(),
            context.getAudience(),
            context.snapshotFn,
            context.closeFn,
            registry,
            logger);

        context.bindRuntime(runtime);
        activeCallback(runtime);
    }

    public get IComponentRouter() { return this; }

    public get connectionState(): ConnectionState {
        return this.componentContext.connectionState;
    }

    public get connected(): boolean {
        return this.connectionState === ConnectionState.Connected;
    }

    public get leader(): boolean {
        return this.componentContext.leader;
    }

    public get clientId(): string {
        return this.componentContext.clientId;
    }

    public get clientType(): string {
        return this.componentContext.clientType;
    }

    public get loader(): ILoader {
        return this.componentContext.loader;
    }

    public get isAttached(): boolean {
        return !this.isLocal;
    }

    public get path(): string {
        return this.id;
    }

    public get routeContext(): IComponentHandleContext {
        return this.componentContext.hostRuntime.IComponentHandleContext;
    }

    public get IComponentSerializer() { return this.componentContext.hostRuntime.IComponentSerializer; }

    public get IComponentHandleContext() { return this; }

    private readonly contexts = new Map<string, IChannelContext>();
    private readonly contextsDeferred = new Map<string, Deferred<IChannelContext>>();
    private closed = false;
    private readonly pendingAttach = new Map<string, IAttachMessage>();
    private requestHandler: ((request: IRequest) => Promise<IResponse>) | undefined;
    private isLocal: boolean;
    private readonly deferredAttached = new Deferred<void>();
    private readonly attachChannelQueue = new Map<string, LocalChannelContext>();
    private boundhandles: Set<IComponentHandle> | undefined;

    private constructor(
        private readonly componentContext: IComponentContext,
        public readonly documentId: string,
        public readonly id: string,
        public readonly parentBranch: string,
        public existing: boolean,
        public readonly options: any,
        private readonly blobManager: IBlobManager,
        public readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        private readonly quorum: IQuorum,
        private readonly audience: IAudience,
        private readonly snapshotFn: (message: string) => Promise<void>,
        private readonly closeFn: () => void,
        private readonly registry: ISharedObjectRegistry,
        public readonly logger: ITelemetryLogger,
    ) {
        super();

        const tree = componentContext.baseSnapshot;

        // Must always receive the component type inside of the attributes
        // tslint:disable-next-line: strict-boolean-expressions
        if (tree && tree.trees) {
            Object.keys(tree.trees).forEach((path) => {
                const channelContext = new RemoteChannelContext(
                    this,
                    componentContext,
                    componentContext.storage,
                    (type, content) => this.submit(type, content),
                    path,
                    tree.trees[path],
                    this.registry,
                    new Map(),
                    componentContext.branch,
                    undefined);
                const deferred = new Deferred<IChannelContext>();
                deferred.resolve(channelContext);

                this.contexts.set(path, channelContext);
                this.contextsDeferred.set(path, deferred);
            });
        }

        this.attachListener();
        this.isLocal = !existing;

        // If it's existing we know it has been attached.
        if (existing) {
            this.deferredAttached.resolve();
        }
    }

    public async createAndAttachComponent(id: string, pkg: string): Promise<IComponentRuntime> {
        const newComponentRuntime = await this.componentContext.createComponent(id, pkg);
        newComponentRuntime.attach();
        return newComponentRuntime;
    }

    public async request(request: IRequest): Promise<IResponse> {
        // system routes
        if (request.url === "/_scheduler") {
            return this.componentContext.hostRuntime.request(request);
        }

        // Parse out the leading slash
        const id = request.url.charAt(0) === "/" ? request.url.substr(1) : request.url;

        // Check for a data type reference first
        if (this.contextsDeferred.has(id)) {
            // tslint:disable-next-line: no-non-null-assertion
            const value = await this.contextsDeferred.get(id)!.promise;
            const channel = await value.getChannel();

            return { mimeType: "fluid/component", status: 200, value: channel };
        }

        // Otherwise defer to an attached request handler
        if (!this.requestHandler) {
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

        // tslint:disable-next-line: no-non-null-assertion
        const context = await this.contextsDeferred.get(id)!.promise;
        const channel = await context.getChannel();

        return channel;
    }

    public createChannel(id: string, type: string): IChannel {
        this.verifyNotClosed();

        const context = new LocalChannelContext(
            id,
            this.registry,
            type,
            this,
            this.componentContext,
            this.componentContext.storage,
            (t, content) => this.submit(t, content));
        this.contexts.set(id, context);

        if (this.contextsDeferred.has(id)) {
            // tslint:disable-next-line: no-non-null-assertion
            this.contextsDeferred.get(id)!.resolve(context);
        } else {
            const deferred = new Deferred<IChannelContext>();
            deferred.resolve(context);
            this.contextsDeferred.set(id, deferred);
        }

        return context.channel;
    }

    /**
     * Registers a channel with the runtime. If the runtime is attached we will attach the channel right away.
     * If the runtime is not attached we will defer the attach until the runtime attaches.
     * @param channel - channel to be registered.
     */
    public registerChannel(channel: IChannel): void {
        // If our Component is not local attach the channel.
        if (!this.isLocal) {
            this.attachChannel(channel);
            return;
        } else {
            // tslint:disable-next-line: no-non-null-assertion
            this.bind(channel.handle!);

            // If our Component is local then add the channel to the queue
            if (!this.attachChannelQueue.has(channel.id)) {
                this.attachChannelQueue.set(channel.id, this.contexts.get(channel.id) as LocalChannelContext);
            }
        }
    }

    /**
     * Attaches this runtime to the container
     * This includes the following:
     * 1. Sending an Attach op that includes all existing state
     * 2. Attaching registered channels
     */
    public attach() {
        if (!this.isLocal) {
            return;
        }

        if (this.boundhandles) {
            this.boundhandles.forEach((handle) => {
                handle.attach();
            });
            this.boundhandles = undefined;
        }

        // Attach the runtime to the container via this callback
        this.componentContext.attach(this);

        // Flush the queue to set any pre-existing channels to local
        this.attachChannelQueue.forEach((channel) => {
            // When we are attaching the component we don't need to send attach for the registered services.
            // This is because they will be captured as part of the Attach component snapshot
            channel.attach();
        });

        this.isLocal = false;
        this.deferredAttached.resolve();
        this.attachChannelQueue.clear();
    }

    public bind(handle: IComponentHandle): void {
        if (!this.boundhandles) {
            this.boundhandles = new Set<IComponentHandle>();
        }

        this.boundhandles.add(handle);
    }

    public changeConnectionState(value: ConnectionState, clientId: string) {
        this.verifyNotClosed();

        // Resend all pending attach messages prior to notifying clients
        if (value === ConnectionState.Connected) {
            for (const [, message] of this.pendingAttach) {
                this.submit(MessageType.Attach, message);
            }
        }

        for (const [, object] of this.contexts) {
            object.changeConnectionState(value, clientId);
        }

        raiseConnectedEvent(this, value, clientId);
    }

    public getQuorum(): IQuorum {
        this.verifyNotClosed();

        return this.quorum;
    }

    public getAudience(): IAudience {
        this.verifyNotClosed();

        return this.audience;
    }

    public snapshot(message: string): Promise<void> {
        this.verifyNotClosed();
        return this.snapshotFn(message);
    }

    public save(tag: string) {
        this.verifyNotClosed();
        this.submit(MessageType.Save, tag);
    }

    public async uploadBlob(file: IGenericBlob): Promise<IGenericBlob> {
        this.verifyNotClosed();

        const blob = await this.blobManager.createBlob(file);
        file.id = blob.id;
        file.url = blob.url;

        this.submit(MessageType.BlobUploaded, blob);

        return file;
    }

    public getBlob(blobId: string): Promise<IGenericBlob | undefined> {
        this.verifyNotClosed();

        return this.blobManager.getBlob(blobId);
    }

    public async getBlobMetadata(): Promise<IGenericBlob[]> {
        return this.blobManager.getBlobMetadata();
    }

    public stop(): Promise<ITreeEntry[]> {
        this.verifyNotClosed();

        this.closed = true;

        return this.snapshotInternal();
    }

    public async close(): Promise<void> {
        this.closeFn();
    }

    public process(message: ISequencedDocumentMessage, local: boolean) {
        this.verifyNotClosed();
        switch (message.type) {
            case MessageType.Attach:
                const attachMessage = message.contents as IAttachMessage;

                // If a non-local operation then go and create the object - otherwise mark it as officially attached.
                if (local) {
                    assert(this.pendingAttach.has(attachMessage.id));
                    this.pendingAttach.delete(attachMessage.id);
                } else {
                    // create storage service that wraps the attach data
                    const origin = message.origin ? message.origin.id : this.documentId;

                    const flatBlobs = new Map<string, string>();
                    const flattened = flatten(attachMessage.snapshot.entries, flatBlobs);
                    const snapshotTree = buildHierarchy(flattened);

                    const remoteChannelContext = new RemoteChannelContext(
                        this,
                        this.componentContext,
                        this.componentContext.storage,
                        (type, content) => this.submit(type, content),
                        attachMessage.id,
                        snapshotTree,
                        this.registry,
                        flatBlobs,
                        origin,
                        { type: attachMessage.type });

                    this.contexts.set(attachMessage.id, remoteChannelContext);
                    if (this.contextsDeferred.has(attachMessage.id)) {
                        // tslint:disable-next-line: no-non-null-assertion
                        this.contextsDeferred.get(attachMessage.id)!.resolve(remoteChannelContext);
                    } else {
                        const deferred = new Deferred<IChannelContext>();
                        deferred.resolve(remoteChannelContext);
                        this.contextsDeferred.set(attachMessage.id, deferred);
                    }
                }

                break;

            case MessageType.Operation:
                this.processOp(message, local);
                break;
            default:
        }

        this.emit("op", message);
    }

    public processSignal(message: IInboundSignalMessage, local: boolean) {
        this.emit("signal", message, local);
    }

    public async snapshotInternal(): Promise<ITreeEntry[]> {
        // Craft the .attributes file for each shared object
        const entries = await Promise.all(Array.from(this.contexts)
            .filter(([key, value]) => {
                // If the object is registered - and we have received the sequenced op creating the object
                // (i.e. it has a base mapping) - then we go ahead and snapshot
                return value.isRegistered();
            })
            .map(async ([key, value]) => {
                const snapshot = await value.snapshot();

                // And then store the tree
                return {
                    mode: FileMode.Directory,
                    path: key,
                    type: TreeEntry[TreeEntry.Tree],
                    value: snapshot,
                };
            }));

        return entries;
    }

    public getAttachSnapshot(): ITreeEntry[] {
        const entries: ITreeEntry[] = [];

        // Craft the .attributes file for each shared object
        for (const [objectId, value] of this.contexts) {
            if (!(value instanceof LocalChannelContext)) {
                throw new Error("Should only be called with local channel handles");
            }

            if (value.isRegistered()) {
                const snapshot = value.getAttachSnapshot();

                // And then store the tree
                entries.push({
                    mode: FileMode.Directory,
                    path: objectId,
                    type: TreeEntry[TreeEntry.Tree],
                    value: snapshot,
                });
            }
        }

        return entries;
    }

    public submitMessage(type: MessageType, content: any) {
        this.submit(type, content);
    }

    public submitSignal(type: string, content: any) {
        this.verifyNotClosed();
        return this.componentContext.submitSignal(type, content);
    }

    public notifyPendingMessages(): void {
        assert(!this.connected);
        this.componentContext.hostRuntime.notifyPendingMessages();
    }

    /**
     * Will return when the component is attached.
     */
    public async waitAttached(): Promise<void> {
        return this.deferredAttached.promise;
    }

    public error(error: any): void {
        this.componentContext.error(error);
    }

    /**
     * Attach channel should only be called after the componentRuntime has been attached
     */
    private attachChannel(channel: IChannel): void {
        this.verifyNotClosed();

        // tslint:disable-next-line: no-non-null-assertion
        channel.handle!.attach();

        // Get the object snapshot and include it in the initial attach
        const snapshot = channel.snapshot();

        const message: IAttachMessage = {
            id: channel.id,
            snapshot,
            type: channel.attributes.type,
        };
        this.pendingAttach.set(channel.id, message);
        if (this.connected) {
            this.submit(MessageType.Attach, message);
        }

        const context = this.contexts.get(channel.id) as LocalChannelContext;
        context.attach();
    }

    private submit(type: MessageType, content: any): number {
        this.verifyNotClosed();
        return this.componentContext.submitMessage(type, content);
    }

    private processOp(message: ISequencedDocumentMessage, local: boolean) {
        this.verifyNotClosed();

        const envelope = message.contents as IEnvelope;
        const channelContext = this.contexts.get(envelope.address);
        assert(channelContext);

        const transformed: ISequencedDocumentMessage = {
            clientId: message.clientId,
            clientSequenceNumber: message.clientSequenceNumber,
            contents: envelope.contents,
            metadata: message.metadata,
            minimumSequenceNumber: message.minimumSequenceNumber,
            origin: message.origin,
            referenceSequenceNumber: message.referenceSequenceNumber,
            sequenceNumber: message.sequenceNumber,
            timestamp: message.timestamp,
            traces: message.traces,
            type: message.type,
        };

        // tslint:disable-next-line: no-non-null-assertion
        channelContext!.processOp(transformed, local);

        return channelContext;
    }

    // Ideally the component runtime should drive this. But the interface change just for this
    // is probably an overkill.
    private attachListener() {
        this.componentContext.on("leader", (clientId: string) => {
            this.emit("leader", clientId);
        });
    }

    private verifyNotClosed() {
        if (this.closed) {
            throw new Error("Runtime is closed");
        }
    }
}
