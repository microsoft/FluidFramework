import * as assert from "assert";
import * as async from "async";
import { EventEmitter } from "events";
import * as api from ".";
import { ThroughputCounter } from "../utils/counters";
import { debug } from "./debug";

export interface IDeltaListener {
    /**
     * Fired when a new delta operation is recieved
     */
    op(message: api.IBase);

    /**
     * Returns the current reference sequence number for the client.
     */
    getReferenceSequenceNumber(): number;
}

/**
 * Helper class that manages incoming delta messages. This class ensures that collaborative objects receive delta
 * messages in order regardless of possible network conditions or timings causing out of order delivery.
 */
export class DeltaManager {
    private pending: api.ISequencedMessage[] = [];
    private fetching = false;

    // The minimum sequence number and last sequence number received from the server
    private minimumSequenceNumber = 0;

    private emitter = new EventEmitter();

    constructor(
        private documentId: string,
        private baseSequenceNumber: number,
        private deltaStorage: api.IDeltaStorageService,
        private deltaConnection: api.IDocumentDeltaConnection) {

        const throughputCounter = new ThroughputCounter(debug, `${this.documentId} `);
        const q = async.queue<api.ISequencedMessage, void>((op, callback) => {
            // Handle the op
            this.handleOp(op);
            callback();
            throughputCounter.acknolwedge();
        }, 1);

        // When the queue is drained reset our timer
        q.drain = () => {
            q.resume();
        };

        // listen for specific events
        this.deltaConnection.on("op", (messages: api.ISequencedMessage[]) => {
            for (const message of messages) {
                throughputCounter.produce();
                q.push(message);
            }
        });

        // Directly fetch all sequence numbers after base
        this.fetchMissingDeltas(this.baseSequenceNumber);
    }

    /**
     * Submits a new delta operation
     */
    public submitOp(message: api.IMessage) {
        this.deltaConnection.submitOp(message);
    }

    public onDelta(listener: (message: api.IBase) => void) {
        this.emitter.addListener("op", listener);
    }

    private handleOp(message: api.ISequencedMessage) {
        // Incoming sequence numbers should be one higher than the previous ones seen. If not we have missed the
        // stream and need to query the server for the missing deltas.
        if (message.document.sequenceNumber !== this.baseSequenceNumber + 1) {
            this.handleOutOfOrderMessage(message);
        } else {
            this.emit(message);
        }
    }

    /**
     * Handles an out of order message retrieved from the server
     */
    private handleOutOfOrderMessage(message: api.ISequencedMessage) {
        if (message.document.sequenceNumber <= this.baseSequenceNumber) {
            debug(`Received duplicate message ${this.documentId}@${message.document.sequenceNumber}`);
            return;
        }

        debug(`Received out of order message ${message.document.sequenceNumber} ${this.baseSequenceNumber}`);
        this.pending.push(message);
        this.fetchMissingDeltas(this.baseSequenceNumber, message.document.sequenceNumber);
    }

    /**
     * Retrieves the missing deltas between the given sequence numbers
     */
    private fetchMissingDeltas(from: number, to?: number) {
        // Exit out early if we're already fetching deltas
        if (this.fetching) {
            return;
        }

        this.fetching = true;
        this.deltaStorage.get(from, to).then(
            (messages) => {
                this.fetching = false;
                this.catchUp(messages);
            },
            (error) => {
                // Retry on failure
                debug(error);
                this.fetching = false;
                this.fetchMissingDeltas(from, to);
            });
    }

    private catchUp(messages: api.ISequencedMessage[]) {
        // Apply current operations
        for (const message of messages) {
            // Ignore sequence numbers prior to the base. This can happen at startup when we fetch all missing
            // deltas while also listening for updates
            if (message.document.sequenceNumber > this.baseSequenceNumber) {
                assert.equal(message.document.sequenceNumber, this.baseSequenceNumber + 1);
                this.emit(message);
            }
        }

        // Then sort pending operations and attempt to apply them again.
        // This could be optimized to stop handling messages once we realize we need to fetch mising values.
        // But for simplicity, and because catching up should be rare, we just process all of them.
        const pendingSorted = this.pending.sort((a, b) => a.document.sequenceNumber - b.document.sequenceNumber);
        this.pending = [];
        for (const pendingMessage of pendingSorted) {
            this.handleOp(pendingMessage);
        }
    }

    /**
     * Revs the base sequence number based on the message and notifices the listener of the new message
     */
    private emit(message: api.ISequencedMessage) {
        // Watch the minimum sequence number and be ready to update as needed
        this.minimumSequenceNumber = message.document.minimumSequenceNumber;
        this.baseSequenceNumber = message.document.sequenceNumber;
        this.emitter.emit("op", message);
    }
}
