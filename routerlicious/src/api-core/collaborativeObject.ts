import * as assert from "assert";
import { EventEmitter } from "events";
import { ValueType } from "../map/definitions";
import { debug } from "./debug";
import { ConnectionState, IDistributedObjectServices, IDocument, IObjectStorageService } from "./document";
import { ILatencyMessage, IObjectMessage, ISequencedObjectMessage, OperationType } from "./protocol";
import { ITree } from "./storage";
import { ICollaborativeObject } from "./types";

export abstract class CollaborativeObject extends EventEmitter implements ICollaborativeObject {
    // tslint:disable-next-line:variable-name
    public __collaborativeObject__ = true;

    // Private fields exposed via getters
    // tslint:disable:variable-name
    private _sequenceNumber: number;
    private _state = ConnectionState.Disconnected;
    // tslint:enable:variable-name

    // Locally applied operations not yet ACK'd by the server
    private pendingOps: IObjectMessage[] = [];

    private services: IDistributedObjectServices;

    // Socketio acked messages timestamp.
    private pingMap: { [clientSequenceNumber: number]: number} = {};

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

    constructor(public id: string, protected document: IDocument, public type: string) {
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
        this.services = this.document.attach(this);
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
    protected abstract prepareCore(message: ISequencedObjectMessage): Promise<any>;

    /**
     * Derived classes must override this to do custom processing on a remote message
     */
    protected abstract processCore(message: ISequencedObjectMessage, context: any);

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

        // Prep the message
        const message: IObjectMessage = {
            clientSequenceNumber: ++this.clientSequenceNumber,
            contents,
            referenceSequenceNumber: this.sequenceNumber,
            type: OperationType,
        };

        // Store the message for when it is ACKed and then submit to the server if connected
        this.pendingOps.push(message);
        this.pingMap[message.clientSequenceNumber] = Date.now();

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
            prepare: async (message) => {
                return this.prepare(message);
            },
            process: (message, context) => {
                this.process(message, context);
            },
            setConnectionState: (state: ConnectionState, context?: any) => {
                this.setConnectionState(state, context);
            },
        });

        // Trigger initial state
        this.setConnectionState(this.services.deltaConnection.state, this.services.deltaConnection.clientId);
    }

    private async prepare(message: ISequencedObjectMessage): Promise<any> {
        return this.prepareCore(message);
    }

    private setConnectionState(state: ConnectionState, context?: any) {
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
                const pendingOps = this.pendingOps;
                this.pendingOps = [];
                this.clientSequenceNumber = 0;

                // And now we are fully connected
                // - we have a client ID
                // - we are caught up enough to attempt to send messages
                this.onConnect(pendingOps);
                break;

            default:
                assert.ok(false, `Unknown ConnectionState ${state}`);
                break;
        }
    }

    /**
     * Handles a message being received from the remote delta server
     */
    private process(message: ISequencedObjectMessage, context: any) {
        // server messages should only be delivered to this method in sequence number order
        assert.equal(this.sequenceNumber + 1, message.sequenceNumber);
        this._sequenceNumber = message.sequenceNumber;

        const local = message.clientId === this.document.clientId;
        if (message.type === OperationType && local) {
            // One of our messages was sequenced. We can remove it from the local message list. Given these arrive
            // in order we only need to check the beginning of the local list.
            if (this.pendingOps.length > 0 &&
                this.pendingOps[0].clientSequenceNumber === message.clientSequenceNumber) {
                this.pendingOps.shift();
                if (this.pendingOps.length === 0) {
                    this.emit("processed");
                }
            } else {
                debug(`Duplicate ack received ${message.clientSequenceNumber}`);
            }

            // Add final trace.
            message.traces.push( { service: "client", action: "end", timestamp: Date.now()});
            // Add ping trace and remove from local map.
            if (message.clientSequenceNumber in this.pingMap) {
                // tslint:disable-next-line:max-line-length
                message.traces.push( { service: "ping", action: "end", timestamp: this.pingMap[message.clientSequenceNumber]});
                delete this.pingMap[message.clientSequenceNumber];
            }

            // Submit the latency message back to server.
            this.submitLatencyMessage(message);
        }

        this.emit("pre-op", message, local);
        this.processCore(message, context);
        this.emit("op", message, local);
    }

    /**
     * Submits a heartbeat message to the remote server
     */
    private submitLatencyMessage(message: ISequencedObjectMessage) {
        const latencyMessage: ILatencyMessage = {
            traces: message.traces,
        };
        this.document.submitLatencyMessage(latencyMessage);
    }
}
