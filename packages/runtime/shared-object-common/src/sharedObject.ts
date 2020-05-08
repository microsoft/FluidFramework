/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { ITelemetryErrorEvent, ITelemetryLogger } from "@microsoft/fluid-common-definitions";
import { IComponentHandle } from "@microsoft/fluid-component-core-interfaces";
import { ChildLogger, EventEmitterWithErrorHandling } from "@microsoft/fluid-common-utils";
import { ConnectionState, ISequencedDocumentMessage, ITree, MessageType } from "@microsoft/fluid-protocol-definitions";
import {
    IChannelAttributes,
    IComponentRuntime,
    IObjectStorageService,
    ISharedObjectServices,
    IExperimentalComponentRuntime,
} from "@microsoft/fluid-runtime-definitions";
import * as Deque from "double-ended-queue";
import { debug } from "./debug";
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
    private _state = ConnectionState.Disconnected;

    /**
     * Locally applied operations not yet ACK'd by the server
     */
    private readonly pendingOps = new Deque<{ clientSequenceNumber: number; content: any }>();

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
    public get state(): ConnectionState {
        return this._state;
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
            runtime !== null ? runtime.logger : undefined, this.attributes.type, { SharedObjectId: id });

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
        const expComponentRuntime = this.runtime as IExperimentalComponentRuntime;
        return expComponentRuntime?.isExperimentalComponentRuntime ?
            expComponentRuntime.isLocal() || this.services === undefined : this.services === undefined;
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
        return (!!this.services || this.registered);
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
     */
    protected abstract processCore(message: ISequencedDocumentMessage, local: boolean);

    /**
     * Called when the object has disconnected from the delta stream.
     */
    protected abstract onDisconnect();

    /**
     * Processes a message by the local client.
     * @param content - Content of the message
     * @returns Client sequence number
     */
    protected submitLocalMessage(content: any): number {
        if (this.isLocal()) {
            return -1;
        }

        let clientSequenceNumber = -1;
        if (this.state === ConnectionState.Connected) {
            // This assert !isLocal above means services can't be undefined.
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            clientSequenceNumber = this.services!.deltaConnection.submit(content);
        } else {
            debug(`${this.id} Not fully connected - adding to pending list`, content);
            this.runtime.notifyPendingMessages();
        }

        // Store the message for when it is ACKed
        this.pendingOps.push({ clientSequenceNumber, content });
        return clientSequenceNumber;
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
     * @param pending - Messages received while disconnected
     */
    protected onConnect(pending: any[]) {
        for (const message of pending) {
            this.submitLocalMessage(message);
        }

        return;
    }

    /**
     * Promises that are waiting for an ack from the server before resolving should use this instead of new Promise.
     * It ensures that if something changes that will interrupt that ack (e.g. the ComponentRuntime disposes),
     * the Promise will reject.
     */
    protected async newAckBasedPromise<T>(
        executor: (resolve: (value?: T | PromiseLike<T> | undefined) => void, reject: (reason?: any) => void) => void,
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            if (this.runtime.disposed) {
                reject("Preparing to wait for an op to be acked but ComponentRuntime has been disposed");
            }

            const rejectOnDispose =
                () => reject(new Error("ComponentRuntime disposed while this ack-based Promise was pending"));

            this.runtime.once("dispose", rejectOnDispose);

            executor(resolve, reject);
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
            process: (message, local) => {
                this.process(message, local);
            },
            setConnectionState: (state: ConnectionState) => {
                this.setConnectionState(state);
            },
        });

        // Trigger initial state
        // attachDeltaHandler is only called after services is assigned
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.setConnectionState(this.services!.deltaConnection.state);
    }

    /**
     * Set the state of connection to services.
     * @param state - The new state of the connection
     */
    private setConnectionState(state: ConnectionState) {
        if (this._state === state) {
            // Not changing state, nothing the same.
            return;
        }

        // Should I change the state at the end? So that we *can't* send new stuff before we send old?
        this._state = state;

        switch (state) {
            case ConnectionState.Disconnected:
                // Things that are true now...
                // - if we had a connection we can no longer send messages over it
                // - if we had outbound messages some may or may not be ACK'd. Won't know until next message
                //
                // - nack could get a new msn - but might as well do it in the join?
                this.onDisconnect();
                this.emit("disconnected");
                break;

            case ConnectionState.Connecting:
                // Things that are now true...
                // - we will begin to receive inbound messages
                // - we know what our new client id is.
                // - still not safe to send messages

                // While connecting we are still ticking off the previous messages
                debug(`${this.id} is now connecting`);
                break;

            case ConnectionState.Connected: {
                // Extract all un-ack'd payload operation
                const pendingOps = this.pendingOps.toArray().map((value) => value.content);
                this.pendingOps.clear();

                // And now we are fully connected
                // - we have a client ID
                // - we are caught up enough to attempt to send messages
                this.onConnect(pendingOps);
                this.emit("connected");
                break;
            }

            default:
                assert.ok(false, `Unknown ConnectionState ${state}`);
        }
    }

    /**
     * Handles a message being received from the remote delta server.
     * @param message - The message to process
     * @param local - Whether the message originated from the local client
     */
    private process(message: ISequencedDocumentMessage, local: boolean) {
        if (message.type === MessageType.Operation && local) {
            this.processPendingOp(message);
        }

        this.emit("pre-op", message, local, this);
        this.processCore(message, local);
        this.emit("op", message, local, this);
    }

    /**
     * Process an op that originated from the local client (i.e. is in pending state).
     * @param message - The op to process
     */
    private processPendingOp(message: ISequencedDocumentMessage) {
        const firstPendingOp = this.pendingOps.peekFront();

        if (firstPendingOp === undefined) {
            this.logger.sendErrorEvent({ eventName: "UnexpectedAckReceived" });
            return;
        }

        // Disconnected ops should never be processed. They should have been fully sent on connected
        assert(firstPendingOp.clientSequenceNumber !== -1,
            `processing disconnected op ${firstPendingOp.clientSequenceNumber}`);

        // One of our messages was sequenced. We can remove it from the local message list. Given these arrive
        // in order we only need to check the beginning of the local list.
        if (firstPendingOp.clientSequenceNumber !== message.clientSequenceNumber) {
            this.logger.sendErrorEvent({ eventName: "WrongAckReceived" });
            return;
        }

        this.pendingOps.shift();
        if (this.pendingOps.length === 0) {
            this.emit("processed");
        }
    }
}
