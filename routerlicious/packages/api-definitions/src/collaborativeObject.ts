import {
    ConnectionState,
    IDistributedObjectServices,
    IObjectMessage,
    IObjectStorageService,
    IRuntime,
    ISequencedObjectMessage,
    ITree,
} from "@prague/runtime-definitions";
import * as assert from "assert";
import * as Deque from "double-ended-queue";
import { EventEmitter } from "events";
import { debug } from "./debug";
import { ICollaborativeObject } from "./types";
import { ValueType } from "./valueType";

// TODO this may migrate to the runtime
export const OperationType = "op";

export abstract class CollaborativeObject extends EventEmitter implements ICollaborativeObject {
    // tslint:disable-next-line:variable-name
    public __collaborativeObject__ = true;

    // Private fields exposed via getters
    // tslint:disable:variable-name
    private _sequenceNumber: number;
    private _state = ConnectionState.Disconnected;
    // tslint:enable:variable-name

    // Locally applied operations not yet ACK'd by the server
    private pendingOps = new Deque<IObjectMessage>();

    private services: IDistributedObjectServices;

    // Sequence number for operations local to this client
    private clientSequenceNumber = 0;

    public get sequenceNumber(): number {
        return this._sequenceNumber;
    }

    public get state(): ConnectionState {
        return this._state;
    }

    public get dirty(): boolean {
        return this.pendingOps.length > 0;
    }

    constructor(public id: string, protected runtime: IRuntime, public type: string) {
        super();
    }

    public toJSON() {
        return {
            type: ValueType[ValueType.Collaborative],
            value: this.id,
        };
    }

    public abstract ready(): Promise<void>;

    /**
     * A collaborative object, after construction, can either be loaded in the case that it is already part of
     * a collaborative document. Or later attached if it is being newly added.
     */
    public async load(
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: ISequencedObjectMessage[],
        headerOrigin: string,
        services: IDistributedObjectServices): Promise<void> {

        this._sequenceNumber = sequenceNumber;
        this.services = services;

        await this.loadCore(
            sequenceNumber,
            minimumSequenceNumber,
            messages,
            headerOrigin,
            services.objectStorage);
        this.attachDeltaHandler();
    }

    /**
     * Initializes the object as a local, non-collaborative object. This object can become collaborative after
     * it is attached to the document.
     */
    public initializeLocal() {
        this._sequenceNumber = 0;
        this.initializeLocalCore();
    }

    /**
     * Attaches the given collaborative object to its containing document
     */
    public attach(): this {
        if (!this.isLocal()) {
            return this;
        }

        // Allow derived classes to perform custom processing prior to attaching this object
        this.attachCore();

        // Notify the document of the attachment
        this.services = this.runtime.attachChannel(this);
        this.attachDeltaHandler();

        return this;
    }

    /**
     * Returns whether the given collaborative object is local
     */
    public isLocal(): boolean {
        return !this.services;
    }

    public on(event: "pre-op" | "op", listener: (op: ISequencedObjectMessage, local: boolean) => void): this;
    public on(event: string | symbol, listener: (...args: any[]) => void): this;

    /* tslint:disable:no-unnecessary-override */
    public on(event: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(event, listener);
    }

    /**
     * Gets a form of the object that can be serialized.
     */
    public abstract snapshot(): ITree;

    /**
     * Creates a new message from the provided message that is relative to the given sequenceNumber. It is valid
     * to modify the passed in object in place.
     */
    public abstract transform(message: IObjectMessage, sequenceNumber: number): IObjectMessage;

    /**
     * Allows the distributed data type to perform custom loading
     */
    protected abstract loadCore(
        sequenceNumber: number,
        minimumSequenceNumber: number,
        messages: ISequencedObjectMessage[],
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
     * Prepares the given message for processing
     */
    protected abstract prepareCore(message: ISequencedObjectMessage, local: boolean): Promise<any>;

    /**
     * Derived classes must override this to do custom processing on a remote message
     */
    protected abstract processCore(message: ISequencedObjectMessage, local: boolean, context: any);

    /**
     * Method called when the minimum sequence number for the object has changed
     */
    protected abstract processMinSequenceNumberChanged(value: number);

    /**
     * Called when the object has disconnected from the delta stream
     */
    protected abstract onDisconnect();

    /**
     * Called when the object has fully connected to the delta stream
     */
    protected abstract onConnect(pending: IObjectMessage[]);

    /**
     * Processes a message by the local client
     */
    protected submitLocalMessage(contents: any): void {
        assert(!this.isLocal());

        /* tslint:disable:no-increment-decrement */
        // Prep the message
        const message: IObjectMessage = {
            clientSequenceNumber: ++this.clientSequenceNumber,
            contents,
            referenceSequenceNumber: this.sequenceNumber,
            type: OperationType,
        };

        // Store the message for when it is ACKed and then submit to the server if connected
        this.pendingOps.push(message);

        // Send if we are connected - otherwise just add to the sent list
        if (this.state === ConnectionState.Connected) {
            this.services.deltaConnection.submit(message);
        } else {
            debug(`${this.id} Not fully connected - adding to pending list`, contents);
        }
    }

    private attachDeltaHandler() {
        this.services.deltaConnection.attach({
            minSequenceNumberChanged: (value) => {
                this.processMinSequenceNumberChanged(value);
            },
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

    private prepare(message: ISequencedObjectMessage, local: boolean): Promise<any> {
        return this.prepareCore(message, local);
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
                // tslint:disable-next-line:max-line-length
                debug(`${this.id} had ${this.pendingOps.length} pending ops`);

                // Extract all un-ack'd payload operation
                const pendingOps = this.pendingOps.toArray();
                this.pendingOps.clear();
                this.clientSequenceNumber = 0;

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
    private process(message: ISequencedObjectMessage, local: boolean, context: any) {
        // server messages should only be delivered to this method in sequence number order
        assert.equal(this.sequenceNumber + 1, message.sequenceNumber);
        this._sequenceNumber = message.sequenceNumber;

        if (message.type === OperationType && local) {
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
