import {
    ConnectionState,
    ISequencedDocumentMessage,
    ITelemetryLogger,
    ITree,
    MessageType,
} from "@prague/container-definitions";
import {
    IComponentRuntime,
    IObjectStorageService,
    ISharedObjectServices,
} from "@prague/runtime-definitions";
import { ChildLogger } from "@prague/utils";
import * as assert from "assert";
import * as Deque from "double-ended-queue";
import { EventEmitter } from "events";
import { debug } from "./debug";
import { ISharedObject } from "./types";
import { ValueType } from "./valueType";

/**
 *  Base class from which all shared objects derive
 */
export abstract class SharedObject extends EventEmitter implements ISharedObject {
    /**
     * Marker to clearly identify the object as a shared object
     */
    // tslint:disable-next-line:variable-name
    public readonly __sharedObject__ = true;

    /**
     * Telemetry logger for the shared object
     */
    protected readonly logger: ITelemetryLogger;

    /**
     * Connection state
     */
    // tslint:disable-next-line:variable-name private fields exposed via getters
    private _state = ConnectionState.Disconnected;

    /**
     * Locally applied operations not yet ACK'd by the server
     */
    private readonly pendingOps = new Deque<{ clientSequenceNumber: number; content: any }>();

    /**
     * Services used by the shared object
     */
    private services: ISharedObjectServices;

    /**
     * Gets the connection state
     *
     * @returns the state of the connection
     */
    public get state(): ConnectionState {
        return this._state;
    }

    /**
     * @param id - the id of the shared object
     * @param runtime - the IComponentRuntime which contains the shared object
     * @param type - type of the shared object
     */
    constructor(public id: string, protected runtime: IComponentRuntime, public type: string) {
        super();
        this.logger = ChildLogger.Create(runtime ? runtime.logger : undefined, type, {SharedObjectId: id});
    }

    /**
     * Creates a JSON object with information about the shared object
     *
     * @returns a JSON object containing the ValueType (always Shared) and the id of the shared object
     */
    public toJSON() {
        return {
            type: ValueType[ValueType.Shared],
            value: this.id,
        };
    }

    /**
     * A shared object, after construction, can either be loaded in the case that it is already part of
     * a shared document. Or later attached if it is being newly added.
     *
     * @param minimumSequenceNumber - the minimum sequence number at time of load
     * @param headerOrigin - the document ID
     * @param services - services used by the shared object
     */
    public async load(
        minimumSequenceNumber: number,
        headerOrigin: string,
        services: ISharedObjectServices): Promise<void> {

        this.services = services;

        await this.getOwnerSnapshot(services.objectStorage);

        await this.loadCore(
            minimumSequenceNumber,
            headerOrigin,
            services.objectStorage);
        this.attachDeltaHandler();
    }

    /**
     * Initializes the object as a local, non-shared object. This object can become shared after
     * it is attached to the document.
     */
    public initializeLocal() {
        this.initializeLocalCore();
    }

    /**
     * Attaches the given shared object to its containing document
     */
    public attach(): this {
        if (!this.isLocal()) {
            return this;
        }

        this.setOwner();

        // Allow derived classes to perform custom processing prior to attaching this object
        this.attachCore();

        // Notify the document of the attachment
        this.services = this.runtime.attachChannel(this);
        this.attachDeltaHandler();

        return this;
    }

    /**
     * Returns whether the given shared object is local
     *
     * @returns true if the given shared object is local
     */
    public isLocal(): boolean {
        return !this.services;
    }

    /**
     * Registers a listener on the specified events
     *
     * @param event - the event to listen for
     * @param listener - the listener to register
     */
    public on(
            event: "pre-op" | "op",
            listener: (op: ISequencedDocumentMessage, local: boolean, target: this) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this;

    /* tslint:disable:no-unnecessary-override */
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    /**
     * Gets a form of the object that can be serialized.
     *
     * @returns a tree representing the snapshot of the shared object
     */
    public abstract snapshot(): ITree;

    /**
     * Set the owner of the object if it is an OwnedSharedObject
     *
     * @returns the owner of the object if it is an OwnedSharedObject, otherwise undefined
     */
    protected setOwner(): string {
        return;
    }

    /**
     * Reads and sets the owner from storage if this is an ownedSharedObject
     *
     * @param storage - the storage used by the shared object
     */
    protected async getOwnerSnapshot(storage: IObjectStorageService): Promise<void> {
         return;
     }

    /**
     * Allows the distributed data type to perform custom loading
     *
     * @param minimumSequenceNumber - the minimum sequence number at time of load
     * @param headerOrigin - the document ID
     * @param services - storage used by the shared object
     */
    protected abstract loadCore(
        minimumSequenceNumber: number,
        headerOrigin: string,
        services: IObjectStorageService): Promise<void>;

    /**
     * Allows the distributed data type to perform custom local loading
     */
    protected abstract initializeLocalCore();

    /**
     * Allows the distributive data type the ability to perform custom processing once an attach has happened
     */
    protected abstract attachCore();

    /**
     * Allows the distributive data type the ability to perform custom processing once an attach has happened.
     * Also called after non-local data type get loaded.
     */
    protected didAttach() {
        return;
    }

    /**
     * Prepares the given message for processing
     *
     * @param message - the message to prepare
     * @param local - true if the object is local
     * @returns resolved when message is prepared
     */
    protected abstract prepareCore(message: ISequencedDocumentMessage, local: boolean): Promise<any>;

    /**
     * Derived classes must override this to do custom processing on a remote message
     *
     * @param message - the message to prepare
     * @param local - true if the shared object is local
     * @param context - additional context for the message
     */
    protected abstract processCore(message: ISequencedDocumentMessage, local: boolean, context: any);

    /**
     * Called when the object has disconnected from the delta stream
     */
    protected abstract onDisconnect();

    /**
     * Called when the object has fully connected to the delta stream
     *
     * @param pending - messages recieved while disconnected
     */
    protected abstract onConnect(pending: any[]);

    /**
     * Processes a message by the local client
     *
     * @param content - content of the message
     * @returns client sequence number
     */
    protected submitLocalMessage(content: any): number {
        assert(!this.isLocal());

        // Send if we are connected - otherwise just add to the sent list
        let clientSequenceNumber = -1;
        if (this.state === ConnectionState.Connected) {
            clientSequenceNumber = this.services.deltaConnection.submit(content);
        } else {
            debug(`${this.id} Not fully connected - adding to pending list`, content);
            // Store the message for when it is ACKed and then submit to the server if connected
        }

        this.pendingOps.push({ clientSequenceNumber, content});
        return clientSequenceNumber;
    }

    /**
     * Prepares the given message for processing
     *
     * @param message - message to be prepared
     * @param local - true if the shared object is local
     * @returns resolved when message is prepared
     */
    protected prepare(message: ISequencedDocumentMessage, local: boolean): Promise<any> {
        return this.prepareCore(message, local);
    }

    /**
     * Report ignorable errors in code logic or data integrity to the logger.
     * Hosting app / container may want to optimize out these call sites and make them no-op.
     * It may also show assert dialog in non-production builds of application.
     *
     * @param condition - if false, assert is logged
     * @param message - actual message to log; ideally should be unique message to identify call site
     */
    protected debugAssert(condition: boolean, message: string) {
        this.logger.debugAssert(condition, message);
    }

    private attachDeltaHandler() {
        // Allows objects to start listening for events
        this.didAttach();

        this.services.deltaConnection.attach({
            prepare: (message, local) => {
                return this.prepare(message, local);
            },
            process: (message, local, context) => {
                this.process(message, local, context);
            },
            setConnectionState: (state: ConnectionState) => {
                this.setConnectionState(state);
            },
        });

        // Trigger initial state
        this.setConnectionState(this.services.deltaConnection.state);
    }

    private setConnectionState(state: ConnectionState) {
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
                break;

            case ConnectionState.Connecting:
                // Things that are now true...
                // - we will begin to receive inbound messages
                // - we know what our new client id is.
                // - still not safe to send messages

                // While connecting we are still ticking off the previous messages
                debug(`${this.id} is now connecting`);
                break;

            case ConnectionState.Connected:
                // Extract all un-ack'd payload operation
                const pendingOps = this.pendingOps.toArray().map((value) => value.content);
                this.pendingOps.clear();

                // And now we are fully connected
                // - we have a client ID
                // - we are caught up enough to attempt to send messages
                this.onConnect(pendingOps);

                break;

            default:
                assert.ok(false, `Unknown ConnectionState ${state}`);
        }
    }

    /**
     * Handles a message being received from the remote delta server
     */
    private process(message: ISequencedDocumentMessage, local: boolean, context: any) {
        if (message.type === MessageType.Operation && local) {
            // disconnected ops should never be processed. They should have been fully sent on connected
            assert(
                this.pendingOps.length === 0 || this.pendingOps.peekFront().clientSequenceNumber !== -1,
                `process for disconnected op ${this.pendingOps.peekFront().clientSequenceNumber}`);

            // One of our messages was sequenced. We can remove it from the local message list. Given these arrive
            // in order we only need to check the beginning of the local list.
            if (this.pendingOps.length > 0 &&
                this.pendingOps.peekFront().clientSequenceNumber === message.clientSequenceNumber) {
                this.pendingOps.shift();
                if (this.pendingOps.length === 0) {
                    this.emit("processed");
                }
            } else {
                debug(`Duplicate ack received ${message.clientSequenceNumber}`);
            }
        }

        this.emit("pre-op", message, local);
        this.processCore(message, local, context);
        this.emit("op", message, local);
    }
}
