import * as assert from "assert";
import { EventEmitter } from "events";
import * as api from ".";
import { debug } from "./debug";

export abstract class CollaborativeObject implements api.ICollaborativeObject {
    // tslint:disable-next-line:variable-name
    public __collaborativeObject__ = true;

    protected events = new EventEmitter();

    // Locally applied operations not yet sent to the server
    private localOps: api.IObjectMessage[] = [];

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
        protected document: api.Document,
        public id: string,
        public type: string,
        private sequenceNum: number,
        protected services?: api.IDistributedObjectServices) {

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
    public abstract snapshot(): api.ITree;

    /**
     * Creates a new message from the provided message that is relative to the given sequenceNumber. It is valid
     * to modify the passed in object in place.
     */
    public transform(message: api.IObjectMessage, sequenceNumber: number): api.IObjectMessage {
        message.referenceSequenceNumber = sequenceNumber;
        return message;
    }

    /**
     * Allows the distributive data type the ability to perform custom processing prior to a delta
     * being submitted to the server
     */
    // tslint:disable-next-line:no-empty
    protected submitCore(message: api.IObjectMessage) {
    }

    /**
     * Allows the distributive data type the ability to perform custom processing once an attach has happened
     */
    // tslint:disable-next-line:no-empty
    protected attachCore() {
    }

    protected abstract processCore(message: api.ISequencedObjectMessage);

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
        const message: api.IObjectMessage = {
            clientSequenceNumber: ++this.clientSequenceNumber,
            contents,
            referenceSequenceNumber: this.sequenceNumber,
            type: api.OperationType,
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
    private processRemoteMessage(message: api.ISequencedObjectMessage) {
        // server messages should only be delivered to this method in sequence number order
        assert.equal(this.sequenceNumber + 1, message.sequenceNumber);
        this.sequenceNum = message.sequenceNumber;
        this.minSequenceNumber = message.minimumSequenceNumber;

        if (message.type === api.OperationType && message.clientId === this.document.clientId) {
            // One of our messages was sequenced. We can remove it from the local message list. Given these arrive
            // in order we only need to check the beginning of the local list.
            if (this.localOps.length > 0 &&
                this.localOps[0].clientSequenceNumber === message.clientSequenceNumber) {
                this.localOps.shift();
            } else {
                debug(`Duplicate ack received ${message.clientSequenceNumber}`);
            }
        }

        this.processCore(message);
    }

    private submit(message: api.IObjectMessage): void {
        this.submitCore(message);
        this.services.deltaConnection.submit(message);
    }
}
