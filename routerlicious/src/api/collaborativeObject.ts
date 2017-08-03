import * as assert from "assert";
import { EventEmitter } from "events";
import * as api from ".";
import { debug } from "./debug";

export abstract class CollaborativeObject implements api.ICollaborativeObject {
    // tslint:disable-next-line:variable-name
    public __collaborativeObject__ = true;

    protected events = new EventEmitter();

    // Locally applied operations not yet sent to the server
    private localOps: api.IMessage[] = [];

    // Sequence number for operations local to this client
    private clientSequenceNumber = 0;

    public get sequenceNumber(): number {
        return this.sequenceNum;
    }

    public get minimumSequenceNumber(): number {
        return this.minSequenceNumber;
    }

    constructor(
        protected document: api.Document,
        public id: string,
        public type: string,
        private sequenceNum: number,
        private minSequenceNumber = 0,
        protected services?: api.IDistributedObjectServices) {

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
        for (const localOp of this.localOps) {
            this.submit(localOp);
        }

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
     * TODO this is temporary to bootstrap the process. For performance/dynamic load/etc... we'll likely expose
     * access to the snapshot behind the storage objects.
     */
    public abstract snapshot(): Promise<api.IObject[]>;

    /**
     * Allows the distributive data type the ability to perform custom processing prior to a delta
     * being submitted to the server
     */
    // tslint:disable-next-line:no-empty
    protected submitCore(message: api.IMessage) {
    }

    protected abstract processCore(operation: any);

    /**
     * Processes a message by the local client
     */
    protected async processLocalOperation(op: any): Promise<void> {
        // Prep the message
        const message: api.IMessage = {
            document: {
                clientSequenceNumber: null,
                referenceSequenceNumber: null,
            },
            object: {
                clientSequenceNumber: this.clientSequenceNumber++,
                referenceSequenceNumber: this.sequenceNumber,
            },
            op,
        };

        // Store the message for when it is ACKed and then submit to the server if connected
        this.localOps.push(message);
        if (this.services) {
            this.submit(message);
        }

        this.processCore(op);

        // TODO op will fire after any map events - which is possibly confusing ordering - to fix we will need
        // to somehow batch events to be fired after the operation completes
        this.events.emit("op", message, true);
    }

    private listenForUpdates() {
        this.services.deltaConnection.on("op", (message) => {
            this.processRemoteMessage(message);
        });
    }

    /**
     * Handles a message coming from the remote service
     */
    private processRemoteMessage(message: api.IBase) {
        // server messages should only be delivered to this method in sequence number order
        assert.equal(this.sequenceNumber + 1, message.object.sequenceNumber);
        this.sequenceNum = message.object.sequenceNumber;
        this.minSequenceNumber = message.object.minimumSequenceNumber;

        if (message.type === api.OperationType) {
            this.processRemoteOperation(message as api.ISequencedMessage);
        }
        // Brodcast the message to listeners.
        this.events.emit("op", message, false);
    }

    private processRemoteOperation(message: api.ISequencedMessage) {
        // server messages should only be delivered to this method in sequence number order
        if (message.clientId === this.document.clientId) {
            // One of our messages was sequenced. We can remove it from the local message list. Given these arrive
            // in order we only need to check the beginning of the local list.
            if (this.localOps.length > 0 &&
                this.localOps[0].object.clientSequenceNumber === message.object.clientSequenceNumber) {
                this.localOps.shift();
            } else {
                debug(`Duplicate ack received ${message.object.clientSequenceNumber}`);
            }
        } else {
            // Message has come from someone else - let's go and update now
            this.processCore(message.op);
        }
    }

    private async submit(message: api.IMessage): Promise<void> {
        this.submitCore(message);
        return this.services.deltaConnection.submitOp(message);
    }
}
