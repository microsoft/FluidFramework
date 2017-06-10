import * as assert from "assert";
import * as async from "async";
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

    // The referenceSequenceNumber identifies the last sent sequence number by the client
    private referenceSequenceNumber = 0;

    // The minimum sequence number and last sequence number received from the server
    private minimumSequenceNumber = 0;

    // Flag indicating whether or not we need to udpate the reference sequence number
    private updateHasBeenRequested = false;
    private updateSequenceNumberTimer: any;

    // Flag indicating whether the client has only received messages
    private readonly = true;

    constructor(
        private baseSequenceNumber: number,
        private deltaStorage: api.IDeltaStorageService,
        private deltaConnection: api.IDeltaConnection,
        private listener: IDeltaListener) {

        const throughputCounter = new ThroughputCounter(
            debug,
            `${this.deltaConnection.objectId} `);

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
        this.readonly = false;
        this.stopSequenceNumberUpdate();
        this.referenceSequenceNumber = message.referenceSequenceNumber;
        this.deltaConnection.submitOp(message);
    }

    private handleOp(message: api.ISequencedMessage) {
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
    private handleOutOfOrderMessage(message: api.ISequencedMessage) {
        if (message.sequenceNumber <= this.baseSequenceNumber) {
            debug(`Received duplicate message ${this.deltaConnection.objectId}@${message.sequenceNumber}`);
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
        this.deltaStorage.get(this.deltaConnection.objectId, from, to).then(
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
     * Acks the server to update the reference sequence number
     */
    private updateSequenceNumber() {
        // Exit early for readonly clients. They don't take part in the minimum sequence number calculation.
        if (this.readonly) {
            return;
        }

        // If an update has already been requeested then mark this fact. We will wait until no updates have
        // been requested before sending the updated sequence number.
        if (this.updateSequenceNumberTimer) {
            this.updateHasBeenRequested = true;
            return;
        }

        // Clear an update in 100 ms
        this.updateSequenceNumberTimer = setTimeout(() => {
            this.updateSequenceNumberTimer = undefined;

            // If a second update wasn't requested then send an update message. Otherwise defer this until we
            // stop processing new messages.
            if (!this.updateHasBeenRequested) {
                let sequenceNumber = this.listener.getReferenceSequenceNumber();
                this.deltaConnection.updateReferenceSequenceNumber(sequenceNumber);
            } else {
                this.updateHasBeenRequested = false;
                this.updateSequenceNumber();
            }
        }, 100);
    }

    private stopSequenceNumberUpdate() {
        if (this.updateSequenceNumberTimer) {
            clearTimeout(this.updateSequenceNumberTimer);
        }

        this.updateHasBeenRequested = false;
        this.updateSequenceNumberTimer = undefined;
    }

    /**
     * Revs the base sequence number based on the message and notifices the listener of the new message
     */
    private emit(message: api.ISequencedMessage) {
        // Watch the minimum sequence number and be ready to update as needed
        this.minimumSequenceNumber = message.minimumSequenceNumber;
        this.baseSequenceNumber = message.sequenceNumber;

        // Fire all listeners
        this.listener.op(message);

        // We will queue a message to update our reference sequence number upon receiving a server operation. This
        // allows the server to know our true reference sequence number and be able to correctly update the minimum
        // sequence number (MSN). We don't ackowledge other message types similarly (like a min sequence number update)
        // to avoid ackowledgement cycles (i.e. ack the MSN update, which updates the MSN, then ack the update, etc...).
        if (message.type === api.OperationType) {
            this.updateSequenceNumber();
        }
    }
}
