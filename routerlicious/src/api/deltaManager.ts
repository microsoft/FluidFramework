import * as assert from "assert";
import * as async from "async";
import { EventEmitter } from "events";
import * as api from ".";
import { ThroughputCounter } from "../utils/counters";
import { debug } from "./debug";

/**
 * Helper class that manages incoming delta messages. This class ensures that collaborative objects receive delta
 * messages in order regardless of possible network conditions or timings causing out of order delivery.
 */
export class DeltaManager {
    private pending: api.ISequencedDocumentMessage[] = [];
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
        const q = async.queue<api.ISequencedDocumentMessage, void>((op, callback) => {
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
        this.deltaConnection.on("op", (messages: api.ISequencedDocumentMessage[]) => {
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
    public submitOp(message: api.IDocumentMessage) {
        this.deltaConnection.submit(message);
    }

    public onDelta(listener: (message: api.ISequencedDocumentMessage) => void) {
        this.emitter.addListener("op", listener);
    }

    private handleOp(message: api.ISequencedDocumentMessage) {
        // Incoming sequence numbers should be one higher than the previous ones seen. If not we have missed the
        // stream and need to query the server for the missing deltas.
        if (message.sequenceNumber !== this.baseSequenceNumber + 1) {
            this.handleOutOfOrderMessage(message);
        } else {
            this.emit(message);
        }
    }

    /**
     * Handles an out of order message retrieved from the server
     */
    private handleOutOfOrderMessage(message: api.ISequencedDocumentMessage) {
        if (message.sequenceNumber <= this.baseSequenceNumber) {
            debug(`Received duplicate message ${this.documentId}@${message.sequenceNumber}`);
            return;
        }

        debug(`Received out of order message ${message.sequenceNumber} ${this.baseSequenceNumber}`);
        this.pending.push(message);
        this.fetchMissingDeltas(this.baseSequenceNumber, message.sequenceNumber);
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

    private catchUp(messages: api.ISequencedDocumentMessage[]) {
        // Apply current operations
        for (const message of messages) {
            // Ignore sequence numbers prior to the base. This can happen at startup when we fetch all missing
            // deltas while also listening for updates
            if (message.sequenceNumber > this.baseSequenceNumber) {
                assert.equal(message.sequenceNumber, this.baseSequenceNumber + 1);
                this.emit(message);
            }
        }

        // Then sort pending operations and attempt to apply them again.
        // This could be optimized to stop handling messages once we realize we need to fetch mising values.
        // But for simplicity, and because catching up should be rare, we just process all of them.
        const pendingSorted = this.pending.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        this.pending = [];
        for (const pendingMessage of pendingSorted) {
            this.handleOp(pendingMessage);
        }
    }

    /**
     * Revs the base sequence number based on the message and notifices the listener of the new message
     */
    private emit(message: api.ISequencedDocumentMessage) {
        // Watch the minimum sequence number and be ready to update as needed
        this.minimumSequenceNumber = message.minimumSequenceNumber;
        this.baseSequenceNumber = message.sequenceNumber;
        this.emitter.emit("op", message);
    }
}
