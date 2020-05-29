/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ITelemetryErrorEvent, ITelemetryLogger } from "@fluidframework/common-definitions";
import { IComponentHandle } from "@fluidframework/component-core-interfaces";
import { ChildLogger, EventEmitterWithErrorHandling } from "@fluidframework/client-common-utils";
import { ISequencedDocumentMessage, ITree } from "@fluidframework/protocol-definitions";
import {
    IChannelAttributes,
    IComponentRuntime,
    IObjectStorageService,
    ISharedObjectServices,
} from "@fluidframework/component-runtime-definitions";
import { v4 as uuid } from "uuid";
import { SharedObjectComponentHandle } from "./handle";
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
    public get IComponentLoadable() { return this; }

    /**
     * The handle referring to this SharedObject
     */
    public readonly handle: IComponentHandle;

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
    private services: ISharedObjectServices | undefined;

    /**
     * True if register() has been called.
     */
    private registered: boolean = false;

    /**
     * Gets the connection state
     * @returns The state of the connection
     */
    public get connected(): boolean {
        return this._connected;
    }

    /**
     * The loadable URL for this SharedObject
     */
    public get url(): string {
        return this.handle.path;
    }

    /**
     * @param id - The id of the shared object
     * @param runtime - The IComponentRuntime which contains the shared object
     * @param attributes - Attributes of the shared object
     */
    constructor(
        public id: string,
        protected runtime: IComponentRuntime,
        public readonly attributes: IChannelAttributes) {
        super();

        this.handle = new SharedObjectComponentHandle(
            this,
            id,
            runtime.IComponentHandleContext);

        // Runtime could be null since some package hasn't turn on strictNullChecks yet
        // We should remove the null check once that is done
        this.logger = ChildLogger.create(
            // eslint-disable-next-line no-null/no-null
            runtime !== null ? runtime.logger : undefined, undefined, { sharedObjectId: uuid() });

        this.on("error", (error: any) => {
            runtime.emit("error", error);
        });
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
     * @param branchId - Branch ID
     * @param services - Services used by the shared object
     */
    public async load(
        branchId: string,
        services: ISharedObjectServices): Promise<void> {
        this.services = services;

        await this.loadCore(
            branchId,
            services.objectStorage);
        this.attachDeltaHandler();
    }

    /**
     * Initializes the object as a local, non-shared object. This object can become shared after
     * it is attached to the document.
     */
    public initializeLocal(): void {
        this.initializeLocalCore();
    }

    /**
     * {@inheritDoc ISharedObject.register}
     */
    public register(): void {
        if (this.isRegistered()) {
            return;
        }

        this.registered = true;

        this.setOwner();

        // Allow derived classes to perform custom processing prior to registering this object
        this.registerCore();

        this.runtime.registerChannel(this);
    }

    /**
     * {@inheritDoc ISharedObject.connect}
     */
    public connect(services: ISharedObjectServices) {
        this.services = services;
        this.attachDeltaHandler();
    }

    /**
     * {@inheritDoc ISharedObject.isLocal}
     */
    public isLocal(): boolean {
        return this.services === undefined || this.runtime.isLocal();
    }

    /**
     * {@inheritDoc ISharedObject.isRegistered}
     */
    public isRegistered(): boolean {
        // If the dds is attached to the component then it should be registered irrespective of
        // whether the container is attached/detached. If it is attached to its component, it will
        // have its services. This will lead to get the dds summarized. It should also be registered
        // if somebody called register on dds explicitly without attaching it which will set
        // this.registered to be true.
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        const isRegistered = (!!this.services || this.registered);
        assert(isRegistered ? true : this.isLocal());
        return isRegistered;
    }

    /**
     * {@inheritDoc ISharedObject.isAttached}
     */
    public isAttached(): boolean {
        const isAttached = this.services !== undefined;
        assert(isAttached ? this.isRegistered() : this.isLocal());
        return isAttached;
    }

    /**
     * {@inheritDoc ISharedObject.snapshot}
     */
    public abstract snapshot(): ITree;

    /**
     * Set the owner of the object if it is an OwnedSharedObject
     * @returns The owner of the object if it is an OwnedSharedObject, otherwise undefined
     */
    protected setOwner(): string | undefined {
        return;
    }

    /**
     * Allows the distributed data type to perform custom loading
     * @param branchId - Branch ID
     * @param services - Storage used by the shared object
     */
    protected abstract loadCore(
        branchId: string,
        services: IObjectStorageService): Promise<void>;

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
     * @returns Client sequence number
     */
    protected submitLocalMessage(content: any, localOpMetadata: unknown = undefined): number {
        if (this.isLocal()) {
            return -1;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        return this.services!.deltaConnection.submit(content, localOpMetadata);
    }

    /**
     * Marks this object as dirty so that it is part of the next summary. It is called by a SharedSummaryBlock
     * that want to be part of summary but does not generate ops.
     */
    protected dirty(): void {
        if (this.isLocal()) {
            return;
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.services!.deltaConnection.dirty();
    }

    /**
     * Called when the object has fully connected to the delta stream
     * Default implementation for DDS, override if different behavior is required.
     */
    protected onConnect() {}

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
     * It ensures that if something changes that will interrupt that ack (e.g. the ComponentRuntime disposes),
     * the Promise will reject.
     */
    protected async newAckBasedPromise<T>(
        executor: (resolve: (value?: T | PromiseLike<T> | undefined) => void, reject: (reason?: any) => void) => void,
    ): Promise<T> {
        let rejectBecauseDispose: () => void;
        return new Promise<T>((resolve, reject) => {
            rejectBecauseDispose =
                () => reject(new Error("ComponentRuntime disposed while this ack-based Promise was pending"));
            this.runtime.on("dispose", rejectBecauseDispose);

            // Even in this case don't return, so the caller's executor can run
            if (this.runtime.disposed) {
                reject("Preparing to wait for an op to be acked but ComponentRuntime has been disposed");
            }

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
        // Allows objects to start listening for events
        this.didAttach();

        // attachDeltaHandler is only called after services is assigned
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.services!.deltaConnection.attach({
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
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.setConnectionState(this.services!.deltaConnection.connected);
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
