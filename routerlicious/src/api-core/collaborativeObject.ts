import * as assert from "assert";
import { EventEmitter } from "events";
import { debug } from "./debug";
import { IDistributedObjectServices, IDocument } from "./document";
import { ILatencyMessage, IObjectMessage, ISequencedObjectMessage, OperationType } from "./protocol";
import { ITree } from "./storage";
import { ICollaborativeObject } from "./types";

export abstract class CollaborativeObject implements ICollaborativeObject {
    // tslint:disable-next-line:variable-name
    public __collaborativeObject__ = true;

    protected events = new EventEmitter();

    // Locally applied operations not yet sent to the server
    private localOps: IObjectMessage[] = [];

    // Socketio acked messages timestamp.
    private pingMap: { [clientSequenceNumber: number]: number} = {};

    // Sequence number for operations local to this client
    private clientSequenceNumber = 0;
    private minSequenceNumber;

    public get sequenceNumber(): number {
        return this.sequenceNum;
    }

    public get minimumSequenceNumber(): number {
        return this.minSequenceNumber;
    }

    public get referenceSequenceNumber(): number {
        return this.services.deltaConnection.referenceSequenceNumber;
    }

    constructor(
        protected document: IDocument,
        public id: string,
        public type: string,
        private sequenceNum: number,
        protected services?: IDistributedObjectServices) {

        // Min sequence number starts off at the initialized sequence number
        this.minSequenceNumber = sequenceNum;

        if (this.services) {
            this.listenForUpdates();
        }
    }

    public on(event: string, listener: (...args: any[]) => void): this {
        this.events.on(event, listener);
        return this;
    }

    public removeListener(event: string, listener: (...args: any[]) => void): this {
        this.events.removeListener(event, listener);
        return this;
    }

    public removeAllListeners(event?: string): this {
        this.events.removeAllListeners(event);
        return this;
    }

    /**
     * Attaches the given collaborative object to its containing document
     */
    public attach(): this {
        if (!this.isLocal()) {
            return this;
        }

        this.services = this.document.attach(this);

        // Listen for updates to create the delta manager
        this.listenForUpdates();

        // And then submit all pending operations.
        assert(this.localOps.length === 0);

        // Allow derived classes to perform custom operations
        this.attachCore();

        return this;
    }

    /**
     * Returns whether the given collaborative object is local
     */
    public isLocal(): boolean {
        return !this.services;
    }

    /**
     * Gets a form of the object that can be serialized.
     */
    public abstract snapshot(): ITree;

    /**
     * Creates a new message from the provided message that is relative to the given sequenceNumber. It is valid
     * to modify the passed in object in place.
     */
    public transform(message: IObjectMessage, sequenceNumber: number): IObjectMessage {
        message.referenceSequenceNumber = sequenceNumber;
        return message;
    }

    /**
     * Allows the distributive data type the ability to perform custom processing prior to a delta
     * being submitted to the server
     */
    // tslint:disable-next-line:no-empty
    protected submitCore(message: IObjectMessage) {
    }

    /**
     * Allows the distributive data type the ability to perform custom processing once an attach has happened
     */
    // tslint:disable-next-line:no-empty
    protected attachCore() {
    }

    protected abstract processCore(message: ISequencedObjectMessage);

    protected abstract processMinSequenceNumberChanged(value: number);

    /**
     * Processes a message by the local client
     */
    protected submitLocalOperation(contents: any): void {
        // Local only operations we can discard as the attach will take care of them
        if (this.isLocal()) {
            return;
        }

        // Prep the message
        const message: IObjectMessage = {
            clientSequenceNumber: ++this.clientSequenceNumber,
            contents,
            referenceSequenceNumber: this.sequenceNumber,
            type: OperationType,
        };

        // Store the message for when it is ACKed and then submit to the server if connected
        this.localOps.push(message);
        if (this.services) {
            this.submit(message);
        }
    }

    private listenForUpdates() {
        this.services.deltaConnection.on("op", (message) => {
            this.processRemoteMessage(message);
        });

        // Min sequence number changed
        this.services.deltaConnection.on("minSequenceNumber", (value) => {
            this.minSequenceNumber = value;
            this.processMinSequenceNumberChanged(this.minimumSequenceNumber);
        });
    }

    /**
     * Handles a message coming from the remote service
     */
    private processRemoteMessage(message: ISequencedObjectMessage) {
        // server messages should only be delivered to this method in sequence number order
        assert.equal(this.sequenceNumber + 1, message.sequenceNumber);
        this.sequenceNum = message.sequenceNumber;
        this.minSequenceNumber = message.minimumSequenceNumber;

        if (message.type === OperationType && message.clientId === this.document.clientId) {
            // One of our messages was sequenced. We can remove it from the local message list. Given these arrive
            // in order we only need to check the beginning of the local list.
            if (this.localOps.length > 0 &&
                this.localOps[0].clientSequenceNumber === message.clientSequenceNumber) {
                this.localOps.shift();
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

        this.processCore(message);
    }

    private submit(message: IObjectMessage): void {
        this.submitCore(message);
        this.services.deltaConnection.submit(message).then(
            () => {
                // Message acked by socketio. Store timestamp locally.
                this.pingMap[message.clientSequenceNumber] = Date.now();
            },
            (error) => {
                // TODO need reconnection logic upon loss of connection
                debug(`Lost connection to server: ${JSON.stringify(error)}`);
                this.events.emit("error", error);
            });
    }

    private submitLatencyMessage(message: ISequencedObjectMessage) {
        const latencyMessage: ILatencyMessage = {
            traces: message.traces,
        };
        this.document.submitLatencyMessage(latencyMessage);
    }
}
