import * as assert from "assert";
import * as async from "async";
import { EventEmitter } from "events";
import { constants } from "../shared";
import { ThroughputCounter } from "../utils/counters";
import { debug } from "./debug";
import * as protocol from "./protocol";
import * as storage from "./storage";

/**
 * Helper class that manages incoming delta messages. This class ensures that collaborative objects receive delta
 * messages in order regardless of possible network conditions or timings causing out of order delivery.
 */
export class DeltaManager {
    private pending: protocol.ISequencedDocumentMessage[] = [];
    private fetching = false;

    // Flag indicating whether or not we need to udpate the reference sequence number
    private updateHasBeenRequested = false;
    private updateSequenceNumberTimer: any;

    // Flag indicating whether the client has only received messages
    private readonly = true;

    // The minimum sequence number and last sequence number received from the server
    private minSequenceNumber = 0;
    private clientSequenceNumber = 0;

    private heartbeatTimer: any;

    private emitter = new EventEmitter();

    public get referenceSequenceNumber(): number {
        return this.baseSequenceNumber;
    }

    public get minimumSequenceNumber(): number {
        return this.minSequenceNumber;
    }

    constructor(
        private documentId: string,
        private baseSequenceNumber: number,
        private deltaStorage: storage.IDeltaStorageService,
        private deltaConnection: storage.IDocumentDeltaConnection) {

        // The MSN starts at the base the manager is initialized to
        this.minSequenceNumber = this.baseSequenceNumber;

        const throughputCounter = new ThroughputCounter(debug, `${this.documentId} `);
        const q = async.queue<protocol.ISequencedDocumentMessage, void>((op, callback) => {
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
        this.deltaConnection.on("op", (messages: protocol.ISequencedDocumentMessage[]) => {
            for (const message of messages) {
                throughputCounter.produce();
                q.push(message);
            }
        });
    }

    /**
     * Submits a new delta operation
     */
    public submit(type: string, contents: any) {
        const message: protocol.IDocumentMessage = {
            clientSequenceNumber: this.clientSequenceNumber++,
            contents,
            referenceSequenceNumber: this.baseSequenceNumber,
            type,
        };

        this.readonly = false;
        this.stopSequenceNumberUpdate();
        this.deltaConnection.submit(message);
    }

    public onDelta(listener: (message: protocol.ISequencedDocumentMessage) => void) {
        this.emitter.addListener("op", listener);
    }

    public handleOp(message: protocol.ISequencedDocumentMessage) {
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
    private handleOutOfOrderMessage(message: protocol.ISequencedDocumentMessage) {
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

    private catchUp(messages: protocol.ISequencedDocumentMessage[]) {
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
    private emit(message: protocol.ISequencedDocumentMessage) {
        // Watch the minimum sequence number and be ready to update as needed
        this.minSequenceNumber = message.minimumSequenceNumber;
        this.baseSequenceNumber = message.sequenceNumber;
        this.emitter.emit("op", message);

        // We will queue a message to update our reference sequence number upon receiving a server operation. This
        // allows the server to know our true reference sequence number and be able to correctly update the minimum
        // sequence number (MSN). We don't ackowledge other message types similarly (like a min sequence number update
        // or a no-op) to avoid ackowledgement cycles (i.e. ack the MSN update, which updates the MSN,
        // then ack the update, etc...).
        if (message.type !== protocol.NoOp) {
            this.updateSequenceNumber();
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

        // The server maintains a time based window for the min sequence number. As such we want to periodically
        // send a heartbeat to get the latest sequence number once the window has moved past where we currently are.
        if (this.heartbeatTimer) {
            clearTimeout(this.heartbeatTimer);
        }
        this.heartbeatTimer = setTimeout(() => {
            this.submit(protocol.NoOp, null);
        }, constants.MinSequenceNumberWindow + 1000);

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
                this.submit(protocol.NoOp, null);
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
}
