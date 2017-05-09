import * as assert from "assert";
import * as api from ".";

export interface IDeltaListener {
    op(message: api.ISequencedMessage);
}

/**
 * Helper class that manages incoming delta messages. This class ensures that collaborative objects receive delta
 * messages in order regardless of possible network conditions or timings causing out of order delivery.
 */
export class DeltaManager {
    private pending: api.ISequencedMessage[] = [];
    private fetching = false;

    constructor(
        private baseSequenceNumber: number,
        private deltaStorage: api.IDeltaStorageService,
        private deltaConnection: api.IDeltaConnection,
        private listener: IDeltaListener) {

        // listen for specific events
        this.deltaConnection.on("op", (message: api.ISequencedMessage) => {
            this.handleOp(message);
        });

        // Directly fetch all sequence numbers after base
        this.fetchMissingDeltas(this.baseSequenceNumber);
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
            console.log(`Received duplicate message ${this.deltaConnection.objectId}@${message.sequenceNumber}`);
            return;
        }

        console.log(`Received out of order sequence number ${message.sequenceNumber}:${this.baseSequenceNumber}`);
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
                console.error(error);
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
     * Revs the base sequence number based on the message and notifices the listener of the new message
     */
    private emit(message: api.ISequencedMessage) {
        this.baseSequenceNumber = message.sequenceNumber;
        this.listener.op(message);
    }
}
