/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { EventEmitter } from "events";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import {
    IComponentHandle,
    IComponentHandleContext,
    IRequest,
    IResponse,
} from "@fluidframework/component-core-interfaces";
import {
    IAudience,
    IBlobManager,
    IDeltaManager,
    IGenericBlob,
    ContainerWarning,
    ILoader,
} from "@fluidframework/container-definitions";
import {
    ChildLogger,
    Deferred,
    raiseConnectedEvent,
} from "@fluidframework/common-utils";
import { buildSnapshotTree } from "@fluidframework/driver-utils";
import { TreeTreeEntry } from "@fluidframework/protocol-base";
import {
    IClientDetails,
    IDocumentMessage,
    IQuorum,
    ISequencedDocumentMessage,
    ITreeEntry,
    MessageType,
} from "@fluidframework/protocol-definitions";
import {
    IAttachMessage,
    IComponentContext,
    IComponentRegistry,
    IComponentRuntimeChannel,
    IEnvelope,
    IInboundSignalMessage,
} from "@fluidframework/runtime-definitions";
import { IChannel, IComponentRuntime } from "@fluidframework/component-runtime-definitions";
import { ISharedObjectFactory } from "@fluidframework/shared-object-base";
import { v4 as uuid } from "uuid";
import { IChannelContext, snapshotChannel } from "./channelContext";
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
export class ComponentRuntime extends EventEmitter implements IComponentRuntimeChannel,
    IComponentRuntime, IComponentHandleContext
{
    public readonly isExperimentalComponentRuntime = true;
    /**
     * Loads the component runtime
     * @param context - The component context
     * @param sharedObjectRegistry - The registry of shared objects used by this component
     * @param activeCallback - The callback called when the component runtime in active
     * @param componentRegistry - The registry of components created and used by this component
     */
    public static load(
        context: IComponentContext,
        sharedObjectRegistry: ISharedObjectRegistry,
        componentRegistry?: IComponentRegistry,
    ): ComponentRuntime {
        const logger = ChildLogger.create(context.containerRuntime.logger, undefined, { componentId: context.id });
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
            sharedObjectRegistry,
            componentRegistry,
            logger);

        context.bindRuntime(runtime);
        return runtime;
    }

    public get IComponentRouter() { return this; }

    public get connected(): boolean {
        return this.componentContext.connected;
    }

    public get leader(): boolean {
        return this.componentContext.leader;
    }

    public get clientId(): string | undefined {
        return this.componentContext.clientId;
    }

    public get clientDetails(): IClientDetails {
        return this.componentContext.containerRuntime.clientDetails;
    }

    public get loader(): ILoader {
        return this.componentContext.loader;
    }

    public get isAttached(): boolean {
        return this._isAttached;
    }

    public get path(): string {
        return this.id;
    }

    public get routeContext(): IComponentHandleContext {
        return this.componentContext.containerRuntime.IComponentHandleContext;
    }

    public get IComponentSerializer() { return this.componentContext.containerRuntime.IComponentSerializer; }

    public get IComponentHandleContext() { return this; }
    public get IComponentRegistry() { return this.componentRegistry; }

    private _disposed = false;
    public get disposed() { return this._disposed; }

    private readonly contexts = new Map<string, IChannelContext>();
    private readonly contextsDeferred = new Map<string, Deferred<IChannelContext>>();
    private readonly pendingAttach = new Map<string, IAttachMessage>();
    private requestHandler: ((request: IRequest) => Promise<IResponse>) | undefined;
    private _isAttached: boolean;
    private readonly deferredAttached = new Deferred<void>();
    private readonly attachChannelQueue = new Map<string, LocalChannelContext>();
    private boundhandles: Set<IComponentHandle> | undefined;

    private constructor(
        private readonly componentContext: IComponentContext,
        public readonly documentId: string,
        public readonly id: string,
        public readonly parentBranch: string | null,
        public existing: boolean,
        public readonly options: any,
        private readonly blobManager: IBlobManager,
        public readonly deltaManager: IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
        private readonly quorum: IQuorum,
        private readonly audience: IAudience,
        private readonly snapshotFn: (message: string) => Promise<void>,
        private readonly sharedObjectRegistry: ISharedObjectRegistry,
        private readonly componentRegistry: IComponentRegistry | undefined,
        public readonly logger: ITelemetryLogger,
    ) {
        super();

        const tree = componentContext.baseSnapshot;

        // Must always receive the component type inside of the attributes
        if (tree?.trees !== undefined) {
            Object.keys(tree.trees).forEach((path) => {
                const channelContext = new RemoteChannelContext(
                    this,
                    componentContext,
                    componentContext.storage,
                    (type, content, localOpMetadata) => this.submit(type, content, localOpMetadata),
                    (address: string) => this.setChannelDirty(address),
                    path,
                    tree.trees[path],
                    this.sharedObjectRegistry,
                    undefined /* extraBlobs */,
                    componentContext.branch,
                    this.componentContext.summaryTracker.createOrGetChild(
                        path,
                        this.deltaManager.referenceSequenceNumber,
                    ));
                const deferred = new Deferred<IChannelContext>();
                deferred.resolve(channelContext);

                this.contexts.set(path, channelContext);
                this.contextsDeferred.set(path, deferred);
            });
        }

        this.attachListener();
        this._isAttached = existing;

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

    public async request(request: IRequest): Promise<IResponse> {
        // System routes
        if (request.url === "/_scheduler") {
            return this.componentContext.containerRuntime.request(request);
        }

        // Parse out the leading slash
        const id = request.url.startsWith("/") ? request.url.substr(1) : request.url;

        // Check for a data type reference first
        if (this.contextsDeferred.has(id)) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const value = await this.contextsDeferred.get(id)!.promise;
            const channel = await value.getChannel();

            return { mimeType: "fluid/component", status: 200, value: channel };
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

        const context = new LocalChannelContext(
            id,
            this.sharedObjectRegistry,
            type,
            this,
            this.componentContext,
            this.componentContext.storage,
            (t, content, localOpMetadata) => this.submit(t, content, localOpMetadata),
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
     * Registers a channel with the runtime. If the runtime is attached we will attach the channel right away.
     * If the runtime is not attached we will defer the attach until the runtime attaches.
     * @param channel - channel to be registered.
     */
    public registerChannel(channel: IChannel): void {
        // If our Component is not local attach the channel.
        if (this._isAttached) {
            this.attachChannel(channel);
            return;
        } else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.bind(channel.handle!);

            // If our Component is local then add the channel to the queue
            if (!this.attachChannelQueue.has(channel.id)) {
                this.attachChannelQueue.set(channel.id, this.contexts.get(channel.id) as LocalChannelContext);
            }
        }
    }

    public isLocal(): boolean {
        return this.componentContext.isLocal();
    }

    /**
     * Attaches this runtime to the container
     * This includes the following:
     * 1. Sending an Attach op that includes all existing state
     * 2. Attaching registered channels
     */
    public attach() {
        if (this._isAttached) {
            return;
        }

        if (this.boundhandles !== undefined) {
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

        this._isAttached = true;
        this.deferredAttached.resolve();
        this.attachChannelQueue.clear();
    }

    public bind(handle: IComponentHandle): void {
        if (this.isAttached) {
            handle.attach();
            return;
        }
        if (this.boundhandles === undefined) {
            this.boundhandles = new Set<IComponentHandle>();
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

    public save(tag: string) {
        this.verifyNotClosed();
        this.submit(MessageType.Save, tag, undefined /* localOpMetadata */);
    }

    public async uploadBlob(file: IGenericBlob): Promise<IGenericBlob> {
        this.verifyNotClosed();

        const blob = await this.blobManager.createBlob(file);
        file.id = blob.id;
        file.url = blob.url;

        this.submit(MessageType.BlobUploaded, blob, undefined /* localOpMetadata */);

        return file;
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    public getBlob(blobId: string): Promise<IGenericBlob | undefined> {
        this.verifyNotClosed();

        return this.blobManager.getBlob(blobId);
    }

    public async getBlobMetadata(): Promise<IGenericBlob[]> {
        return this.blobManager.getBlobMetadata();
    }

    public process(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        this.verifyNotClosed();
        switch (message.type) {
            case MessageType.Attach: {
                const attachMessage = message.contents as IAttachMessage;

                // If a non-local operation then go and create the object
                // Otherwise mark it as officially attached.
                if (local) {
                    assert(this.pendingAttach.has(attachMessage.id), "Unexpected attach (local) channel OP");
                    this.pendingAttach.delete(attachMessage.id);
                } else {
                    assert(!this.contexts.has(attachMessage.id), "Unexpected attach channel OP");

                    // Create storage service that wraps the attach data
                    const origin = message.origin?.id ?? this.documentId;

                    const flatBlobs = new Map<string, string>();
                    const snapshotTreeP = buildSnapshotTree(attachMessage.snapshot.entries, flatBlobs);
                    // flatBlobsP's validity is contingent on snapshotTreeP's resolution
                    const flatBlobsP = snapshotTreeP.then((snapshotTree) => { return flatBlobs; });

                    const remoteChannelContext = new RemoteChannelContext(
                        this,
                        this.componentContext,
                        this.componentContext.storage,
                        (type, content, localContentMetadata) => this.submit(type, content, localContentMetadata),
                        (address: string) => this.setChannelDirty(address),
                        attachMessage.id,
                        snapshotTreeP,
                        this.sharedObjectRegistry,
                        flatBlobsP,
                        origin,
                        this.componentContext.summaryTracker.createOrGetChild(
                            attachMessage.id,
                            message.sequenceNumber,
                        ),
                        attachMessage.type);

                    this.contexts.set(attachMessage.id, remoteChannelContext);
                    if (this.contextsDeferred.has(attachMessage.id)) {
                        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                        this.contextsDeferred.get(attachMessage.id)!.resolve(remoteChannelContext);
                    } else {
                        const deferred = new Deferred<IChannelContext>();
                        deferred.resolve(remoteChannelContext);
                        this.contextsDeferred.set(attachMessage.id, deferred);
                    }
                }
                break;
            }

            case MessageType.Operation:
                this.processOp(message, local, localOpMetadata);
                break;
            default:
        }

        this.emit("op", message);
    }

    public processSignal(message: IInboundSignalMessage, local: boolean) {
        this.emit("signal", message, local);
    }

    public async snapshotInternal(fullTree: boolean = false): Promise<ITreeEntry[]> {
        // Craft the .attributes file for each shared object
        const entries = await Promise.all(Array.from(this.contexts)
            .filter(([key, value]) =>
                // If the object is registered - and we have received the sequenced op creating the object
                // (i.e. it has a base mapping) - then we go ahead and snapshot
                value.isRegistered(),
            )
            .map(async ([key, value]) => {
                const snapshot = await value.snapshot(fullTree);

                // And then store the tree
                return new TreeTreeEntry(key, snapshot);
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
                entries.push(new TreeTreeEntry(objectId, snapshot));
            }
        }

        return entries;
    }

    public submitMessage(type: MessageType, content: any, localOpMetadata: unknown) {
        this.submit(type, content, localOpMetadata);
    }

    public submitSignal(type: string, content: any) {
        this.verifyNotClosed();
        return this.componentContext.submitSignal(type, content);
    }

    public notifyPendingMessages(): void {
        assert(!this.connected);
        this.componentContext.containerRuntime.notifyPendingMessages();
    }

    /**
     * Will return when the component is attached.
     */
    public async waitAttached(): Promise<void> {
        return this.deferredAttached.promise;
    }

    public raiseContainerWarning(warning: ContainerWarning): void {
        this.componentContext.raiseContainerWarning(warning);
    }

    /**
     * Attach channel should only be called after the componentRuntime has been attached
     */
    private attachChannel(channel: IChannel): void {
        this.verifyNotClosed();
        // If this handle is already attached no need to attach again.
        if (channel.handle?.isAttached) {
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        channel.handle!.attach();

        assert(this.isAttached, "Component should be attached to attach the channel.");
        // If the container is detached, we don't need to send OP or add to pending attach because
        // we will summarize it while uploading the create new summary and make it known to other
        // clients. If the container is attached and component is not attached we will never reach here.
        if (!this.isLocal()) {
            // Get the object snapshot and include it in the initial attach
            const snapshot = snapshotChannel(channel);

            const message: IAttachMessage = {
                id: channel.id,
                snapshot,
                type: channel.attributes.type,
            };
            this.pendingAttach.set(channel.id, message);
            this.submit(MessageType.Attach, message, undefined /* localOpMetadata */);
        }

        const context = this.contexts.get(channel.id) as LocalChannelContext;
        context.attach();
    }

    private submit(type: MessageType, content: any, localOpMetadata: unknown): number {
        this.verifyNotClosed();
        return this.componentContext.submitMessage(type, content, localOpMetadata);
    }

    /**
     * For messages of type MessageType.Operation, finds the right channel and asks it to resubmit the message.
     * For all other messages, just submit it again.
     * This typically happens when we reconnect and there are unacked messages.
     * @param content - The content of the original message.
     * @param localOpMetadata - The local metadata associated with the original message.
     */
    public reSubmit(type: MessageType, content: any, localOpMetadata: unknown) {
        this.verifyNotClosed();

        switch (type) {
            case MessageType.Operation:
            {
                // For Operations, find the right channel and trigger resubmission on it.
                const envelope = content as IEnvelope;
                const channelContext = this.contexts.get(envelope.address);
                assert(channelContext, "There should be a channel context for the op");

                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                channelContext!.reSubmit(envelope.contents, localOpMetadata);

                break;
            }
            case MessageType.Attach:
                // For Attach messages, just submit them again.
                this.submit(type, content, localOpMetadata);
                break;
            default:
                // For other types of messages, submit it again but log an error indicating a resubmit was triggered
                // for it. We should look at the telemetry periodically to determine if these are valid or not and
                // take necessary steps.
                this.submit(type, content, localOpMetadata);
                this.logger.sendErrorEvent({
                    eventName: "UnexpectedComponentResubmitMessage",
                    messageType: type,
                });
        }
    }

    private setChannelDirty(address: string): void {
        this.verifyNotClosed();
        this.componentContext.setChannelDirty(address);
    }

    private processOp(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
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
            term: message.term ?? 1,
            traces: message.traces,
            type: message.type,
        };

        channelContext.processOp(transformed, local, localOpMetadata);
        return channelContext;
    }

    private attachListener() {
        this.componentContext.on("leader", () => {
            this.emit("leader");
        });
        this.componentContext.on("notleader", () => {
            this.emit("notleader");
        });
    }

    private verifyNotClosed() {
        if (this._disposed) {
            throw new Error("Runtime is closed");
        }
    }
}
