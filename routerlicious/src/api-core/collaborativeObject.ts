import * as assert from "assert";
import { EventEmitter } from "events";
import { ICommit } from "gitresources";
import { debug } from "./debug";
import { IDistributedObjectServices, IDocument } from "./document";
import { ILatencyMessage, IObjectMessage, ISequencedObjectMessage, OperationType } from "./protocol";
import { ITree } from "./storage";
import { ICollaborativeObject } from "./types";

export abstract class CollaborativeObject extends EventEmitter implements ICollaborativeObject {
    // tslint:disable-next-line:variable-name
    public __collaborativeObject__ = true;

    // Private fields exposed via getters
    // tslint:disable:variable-name
    private _services: IDistributedObjectServices;
    private _minimumSequenceNumber: number;
    private _sequenceNumber: number;
    // tslint:enable:variable-name

    // Locally applied operations not yet ACK'd by the server
    private localOps: IObjectMessage[] = [];

    // Socketio acked messages timestamp.
    private pingMap: { [clientSequenceNumber: number]: number} = {};

    // Sequence number for operations local to this client
    private clientSequenceNumber = 0;

    public get sequenceNumber(): number {
        return this._sequenceNumber;
    }

    public get minimumSequenceNumber(): number {
        return this._minimumSequenceNumber;
    }

    public get referenceSequenceNumber(): number {
        return this.services.deltaConnection.referenceSequenceNumber;
    }

    protected get services(): IDistributedObjectServices {
        return this._services;
    }

    constructor(public id: string, protected document: IDocument, public type: string) {
        super();
    }

    /**
     * A collaborative object, after construction, can either be loaded in the case that it is already part of
     * a collaborative document. Or later attached if it is being newly added.
     */
    public load(
        sequenceNumber: number,
        version: ICommit,
        header: string,
        headerOrigin: string,
        services: IDistributedObjectServices) {

        this._sequenceNumber = sequenceNumber;
        this._minimumSequenceNumber = sequenceNumber;
        this._services = services;
        this.loadCore(sequenceNumber, version, header, headerOrigin, services);
        this.listenForUpdates();
    }

    /**
     * Initializes the object as a local, non-collaborative object. This object can become collaborative after
     * it is attached to the document.
     */
    public initializeLocal() {
        this._sequenceNumber = 0;
        this._minimumSequenceNumber = 0;
        this.initializeLocalCore();
    }

    /**
     * Attaches the given collaborative object to its containing document
     */
    public attach(): this {
        if (!this.isLocal()) {
            return this;
        }

        // Notify the document of the attachment
        this._services = this.document.attach(this);

        // Listen for updates to create the delta manager
        this.listenForUpdates();

        // Allow derived classes to perform custom processing
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
    public abstract transform(message: IObjectMessage, sequenceNumber: number): IObjectMessage;

    /**
     * Allows the distributed data type to perform custom loading
     */
    protected abstract loadCore(
        sequenceNum: number,
        version: ICommit,
        header: string,
        headerOrigin: string,
        services: IDistributedObjectServices);

    /**
     * Allows the distributed data type to perform custom local loading
     */
    protected abstract initializeLocalCore();

    /**
     * Allows the distributive data type the ability to perform custom processing once an attach has happened
     */
    protected abstract attachCore();

    /**
     * Derived classes must override this to do custom processing on a remote message
     */
    protected abstract processCore(message: ISequencedObjectMessage);

    /**
     * Method called when the minimum sequence number for the object has changed
     */
    protected abstract processMinSequenceNumberChanged(value: number);

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
        this.localOps.push(message);

        this.services.deltaConnection.submit(message).then(
            () => {
                // Message acked by socketio. Store timestamp locally.
                this.pingMap[message.clientSequenceNumber] = Date.now();
            },
            (error) => {
                // TODO need reconnection logic upon loss of connection
                debug(`Lost connection to server: ${JSON.stringify(error)}`);
                this.emit("error", error);
            });
    }

    /**
     * Causes the collaborative object to begin listening for remote messages
     */
    private listenForUpdates() {
        this.services.deltaConnection.on("op", (message) => {
            this.processRemoteMessage(message);
        });

        this.services.deltaConnection.on("minSequenceNumber", (value) => {
            this._minimumSequenceNumber = value;
            this.processMinSequenceNumberChanged(this.minimumSequenceNumber);
        });
    }

    /**
     * Handles a message being received from the remote delta server
     */
    private processRemoteMessage(message: ISequencedObjectMessage) {
        // server messages should only be delivered to this method in sequence number order
        assert.equal(this.sequenceNumber + 1, message.sequenceNumber);
        this._sequenceNumber = message.sequenceNumber;
        this._minimumSequenceNumber = message.minimumSequenceNumber;

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
