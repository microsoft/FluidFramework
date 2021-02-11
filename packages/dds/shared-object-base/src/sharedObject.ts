/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { v4 as uuid } from "uuid";
import { ITelemetryErrorEvent, ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert } from "@fluidframework/common-utils";
import { AttachState } from "@fluidframework/container-definitions";
import { IFluidHandle, IFluidSerializer } from "@fluidframework/core-interfaces";
import {
    IChannelAttributes,
    IFluidDataStoreRuntime,
    IChannelStorageService,
    IChannelServices,
} from "@fluidframework/datastore-definitions";
import { ISequencedDocumentMessage, ITree } from "@fluidframework/protocol-definitions";
import {
    IChannelSummarizeResult,
    IGarbageCollectionData,
    ISummaryTreeWithStats,
} from "@fluidframework/runtime-definitions";
import { convertToSummaryTreeWithStats, FluidSerializer } from "@fluidframework/runtime-utils";
import { ChildLogger, EventEmitterWithErrorHandling } from "@fluidframework/telemetry-utils";
import { SharedObjectHandle } from "./handle";
import { SummarySerializer } from "./summarySerializer";
import { ISharedObject, ISharedObjectEvents } from "./types";

/**
 *  Base class from which all shared objects derive
 */
export abstract class SharedObject<TEvent extends ISharedObjectEvents = ISharedObjectEvents>
    extends EventEmitterWithErrorHandling<TEvent> implements ISharedObject<TEvent> {
    /**
     * @param obj - The thing to check if it is a SharedObject
     * @returns Returns true if the thing is a SharedObject
     */
    public static is(obj: any): obj is SharedObject {
        return obj?.ISharedObject !== undefined;
    }

    public get ISharedObject() { return this; }
    public get IChannel() { return this; }
    public get IFluidLoadable() { return this; }

    /**
     * The handle referring to this SharedObject
     */
    public readonly handle: IFluidHandle;

    /**
     * Telemetry logger for the shared object
     */
    protected readonly logger: ITelemetryLogger;

    /**
     * Connection state
     */
    private _connected = false;

    /**
     * Services used by the shared object
     */
    private services: IChannelServices | undefined;

    /**
     * True if the dds is bound to its parent.
     */
    private _isBoundToContext: boolean = false;

    /**
     * True while we are summarizing this object's data.
     */
    private _isSummarizing: boolean = false;

    /**
     * Gets the connection state
     * @returns The state of the connection
     */
    public get connected(): boolean {
        return this._connected;
    }

    // Back-compat <= 0.28
    public get url(): string {
        return this.id;
    }

    protected get serializer(): IFluidSerializer {
        /**
         * During summarize, the SummarySerializer keeps track of IFluidHandles that are serialized. These handles
         * represent references to other Fluid objects and are used for garbage collection.
         *
         * This is fine for now. However, if we implement delay loading in DDss, they may load and de-serialize content
         * in summarize. When that happens, they may incorrectly hit this assert and we will have to change this.
         */
        assert(!this._isSummarizing, "SummarySerializer should be used for serializing data during summary.");
        return this._serializer;
    }

    /**
     * The serializer to use to serialize / parse handles, if any.
     */
    private readonly _serializer: IFluidSerializer;

    /**
     * @param id - The id of the shared object
     * @param runtime - The IFluidDataStoreRuntime which contains the shared object
     * @param attributes - Attributes of the shared object
     */
    constructor(
        public id: string,
        protected runtime: IFluidDataStoreRuntime,
        public readonly attributes: IChannelAttributes) {
        super();

        this.handle = new SharedObjectHandle(
            this,
            id,
            runtime.IFluidHandleContext);

        // Runtime could be null since some package hasn't turn on strictNullChecks yet
        // We should remove the null check once that is done
        this.logger = ChildLogger.create(
            // eslint-disable-next-line no-null/no-null
            runtime !== null ? runtime.logger : undefined, undefined, { sharedObjectId: uuid() });

        this._serializer = new FluidSerializer(this.runtime.channelsRoutingContext);

        this.attachListeners();
    }

    private attachListeners() {
        this.on("error", (error: any) => {
            this.runtime.raiseContainerWarning(error);
        });

        // Only listen to these events if not attached.
        if (!this.isAttached()) {
            this.runtime.once("attaching", () => {
                // Calling this will let the dds to do any custom processing based on attached
                // like starting generating ops.
                this.didAttach();
            });
        }
    }

    /**
     * Not supported - use handles instead
     */
    public toJSON() {
        throw new Error("Only the handle can be converted to JSON");
    }

    /**
     * A shared object, after construction, can either be loaded in the case that it is already part of
     * a shared document. Or later attached if it is being newly added.
     * @param services - Services used by the shared object
     */
    public async load(services: IChannelServices): Promise<void> {
        if (this.runtime.attachState !== AttachState.Detached) {
            this.services = services;
        }
        await this.loadCore(services.objectStorage);
        if (this.runtime.attachState !== AttachState.Detached) {
            this.attachDeltaHandler();
        }
    }

    /**
     * Initializes the object as a local, non-shared object. This object can become shared after
     * it is attached to the document.
     */
    public initializeLocal(): void {
        this.initializeLocalCore();
    }

    /**
     * {@inheritDoc (ISharedObject:interface).bindToContext}
     */
    public bindToContext(): void {
        if (this._isBoundToContext) {
            return;
        }

        this._isBoundToContext = true;

        this.setOwner();

        // Allow derived classes to perform custom processing prior to registering this object
        this.registerCore();

        this.runtime.bindChannel(this);
    }

    /**
     * {@inheritDoc (ISharedObject:interface).connect}
     */
    public connect(services: IChannelServices) {
        this.services = services;
        this.attachDeltaHandler();
    }

    /**
     * {@inheritDoc (ISharedObject:interface).isAttached}
     */
    public isAttached(): boolean {
        return this.services !== undefined && this.runtime.attachState !== AttachState.Detached;
    }

    /**
     * {@inheritDoc (ISharedObject:interface).summarize}
     */
    public summarize(fullTree: boolean = false, trackState: boolean = false): IChannelSummarizeResult {
        // Set _isSummarizing to true. This flag is used to ensure that we only use SummarySerializer (created below)
        // to serialize handles in this object's data. The routes of these serialized handles are outbound routes
        // to other Fluid objects.
        assert(!this._isSummarizing, "Possible re-entrancy! Summary should not already be in progress.");
        this._isSummarizing = true;

        let summaryTree: ISummaryTreeWithStats;
        let gcData: IGarbageCollectionData;
        try {
            const serializer = new SummarySerializer(this.runtime.channelsRoutingContext);
            const snapshot: ITree = this.snapshotCore(serializer);
            summaryTree = convertToSummaryTreeWithStats(snapshot, fullTree);

            // Add this channel's garbage collection data to the summarize result. The outbound routes of this channel
            // are all the routes of all the handles that are tracked by the SummarySerializer above.
            gcData = {
                gcNodes: { "/": serializer.getSerializedRoutes() },
            };

            assert(this._isSummarizing, "Possible re-entrancy! Summary should have been in progress.");
        } finally {
            this._isSummarizing = false;
        }

        return {
            ...summaryTree,
            gcData,
        };
    }

    /**
     * {@inheritDoc (ISharedObject:interface).getGCData}
     */
    public getGCData(fullGC: boolean = false): IGarbageCollectionData {
        // We run the full summarize logic to get the list of outbound routes from this object. This is a little
        // expensive but its okay for now. It will be udpated to not use full summarize and make it more efficient.
        // See: https://github.com/microsoft/FluidFramework/issues/4547

        // Set _isSummarizing to true. This flag is used to ensure that we only use SummarySerializer (created below)
        // to serialize handles in this object's data. The routes of these serialized handles are outbound routes
        // to other Fluid objects.
        assert(!this._isSummarizing, "Possible re-entrancy! Summary should not already be in progress.");
        this._isSummarizing = true;

        let gcData: IGarbageCollectionData;
        try {
            const serializer = new SummarySerializer(this.runtime.channelsRoutingContext);
            this.snapshotCore(serializer);

            // The GC data for this shared object contains a single GC node. The outbound routes of this node are the
            // routes of handles serialized during snapshot.
            gcData = {
                gcNodes: { "/": serializer.getSerializedRoutes() },
            };

            assert(this._isSummarizing, "Possible re-entrancy! Summary should have been in progress.");
        } finally {
            this._isSummarizing = false;
        }

        return gcData;
    }

    /**
     * back-compat 0.30 - This is deprecated. summarize() should be used instead.
     */
    public snapshot(): ITree {
        return this.snapshotCore(this.serializer);
    }

    /**
     * Gets a form of the object that can be serialized.
     * @returns A tree representing the snapshot of the shared object.
     */
    protected abstract snapshotCore(serializer: IFluidSerializer): ITree;

    /**
     * Set the owner of the object if it is an OwnedSharedObject
     * @returns The owner of the object if it is an OwnedSharedObject, otherwise undefined
     */
    protected setOwner(): string | undefined {
        return;
    }

    /**
     * Allows the distributed data type to perform custom loading
     * @param services - Storage used by the shared object
     */
    protected abstract loadCore(services: IChannelStorageService): Promise<void>;

    /**
     * Allows the distributed data type to perform custom local loading.
     */
    protected initializeLocalCore() {
        return;
    }

    /**
     * Allows the distributed data type the ability to perform custom processing once an attach has happened.
     */
    protected abstract registerCore();

    /**
     * Allows the distributive data type the ability to perform custom processing once an attach has happened.
     * Also called after non-local data type get loaded.
     */
    protected didAttach() {
        return;
    }

    /**
     * Derived classes must override this to do custom processing on a remote message.
     * @param message - The message to process
     * @param local - True if the shared object is local
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     */
    protected abstract processCore(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown);

    /**
     * Called when the object has disconnected from the delta stream.
     */
    protected abstract onDisconnect();

    /**
     * Submits a message by the local client to the runtime.
     * @param content - Content of the message
     * @param localOpMetadata - The local metadata associated with the message. This is kept locally by the runtime
     * and not sent to the server. This will be sent back when this message is received back from the server. This is
     * also sent if we are asked to resubmit the message.
     */
    protected submitLocalMessage(content: any, localOpMetadata: unknown = undefined): void {
        if (this.isAttached()) {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            this.services!.deltaConnection.submit(content, localOpMetadata);
        }
    }

    /**
     * Marks this object as dirty so that it is part of the next summary. It is called by a SharedSummaryBlock
     * that want to be part of summary but does not generate ops.
     */
    protected dirty(): void {
        if (!this.isAttached()) {
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.services!.deltaConnection.dirty();
    }

    /**
     * Called when the object has fully connected to the delta stream
     * Default implementation for DDS, override if different behavior is required.
     */
    protected onConnect() { }

    /**
     * Called when a message has to be resubmitted. This typically happens after a reconnection for unacked messages.
     * The default implementation here is to resubmit the same message. The client can override if different behavior
     * is required. It can choose to resubmit the same message, submit different / multiple messages or not submit
     * anything at all.
     * @param content - The content of the original message.
     * @param localOpMetadata - The local metadata associated with the original message.
     */
    protected reSubmitCore(content: any, localOpMetadata: unknown) {
        this.submitLocalMessage(content, localOpMetadata);
    }

    /**
     * Promises that are waiting for an ack from the server before resolving should use this instead of new Promise.
     * It ensures that if something changes that will interrupt that ack (e.g. the FluidDataStoreRuntime disposes),
     * the Promise will reject.
     * If runtime is disposed when this call is made, executor is not run and promise is rejected right away.
     */
    protected async newAckBasedPromise<T>(
        executor: (resolve: (value: T | PromiseLike<T>) => void, reject: (reason?: any) => void) => void,
    ): Promise<T> {
        let rejectBecauseDispose: () => void;
        return new Promise<T>((resolve, reject) => {
            rejectBecauseDispose =
                () => reject(new Error("FluidDataStoreRuntime disposed while this ack-based Promise was pending"));

            if (this.runtime.disposed) {
                rejectBecauseDispose();
                return;
            }

            this.runtime.on("dispose", rejectBecauseDispose);
            executor(resolve, reject);
        }).finally(() => {
            // Note: rejectBecauseDispose will never be undefined here
            this.runtime.off("dispose", rejectBecauseDispose);
        });
    }

    /**
     * Report ignorable errors in code logic or data integrity to the logger.
     * Hosting app / container may want to optimize out these call sites and make them no-op.
     * It may also show assert dialog in non-production builds of application.
     * @param condition - If false, assert is logged
     * @param message - Actual message to log; ideally should be unique message to identify call site
     */
    protected debugAssert(condition: boolean, event: ITelemetryErrorEvent) {
        this.logger.debugAssert(condition, event);
    }

    private attachDeltaHandler() {
        // Services should already be there in case we are attaching delta handler.
        assert(this.services !== undefined, "Services should be there to attach delta handler");
        this._isBoundToContext = true;
        // Allows objects to do any custom processing if it is attached.
        this.didAttach();

        // attachDeltaHandler is only called after services is assigned
        this.services.deltaConnection.attach({
            process: (message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) => {
                this.process(message, local, localOpMetadata);
            },
            setConnectionState: (connected: boolean) => {
                this.setConnectionState(connected);
            },
            reSubmit: (content: any, localOpMetadata: unknown) => {
                this.reSubmit(content, localOpMetadata);
            },
        });

        // Trigger initial state
        // attachDeltaHandler is only called after services is assigned
        this.setConnectionState(this.services.deltaConnection.connected);
    }

    /**
     * Set the state of connection to services.
     * @param connected - true if connected, false otherwise.
     */
    private setConnectionState(connected: boolean) {
        if (this._connected === connected) {
            // Not changing state, nothing the same.
            return;
        }

        // Should I change the state at the end? So that we *can't* send new stuff before we send old?
        this._connected = connected;

        if (!connected) {
            // Things that are true now...
            // - if we had a connection we can no longer send messages over it
            // - if we had outbound messages some may or may not be ACK'd. Won't know until next message
            //
            // - nack could get a new msn - but might as well do it in the join?
            this.onDisconnect();
        } else {
            // Call this for now so that DDSes like ConsensesOrderedCollection that maintain their own pending
            // messages will work.
            this.onConnect();
        }
    }

    /**
     * Handles a message being received from the remote delta server.
     * @param message - The message to process
     * @param local - Whether the message originated from the local client
     * @param localOpMetadata - For local client messages, this is the metadata that was submitted with the message.
     * For messages from a remote client, this will be undefined.
     */
    private process(message: ISequencedDocumentMessage, local: boolean, localOpMetadata: unknown) {
        this.emit("pre-op", message, local, this);
        this.processCore(message, local, localOpMetadata);
        this.emit("op", message, local, this);
    }

    /**
     * Called when a message has to be resubmitted. This typically happens for unacked messages after a
     * reconnection.
     * @param content - The content of the original message.
     * @param localOpMetadata - The local metadata associated with the original message.
     */
    private reSubmit(content: any, localOpMetadata: unknown) {
        this.reSubmitCore(content, localOpMetadata);
    }
}
