import * as assert from "assert";
import * as queue from "async/queue";
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

    private lastSequenceNumber: number;

    private q: any;

    public get referenceSequenceNumber(): number {
        return this.baseSequenceNumber;
    }

    public get minimumSequenceNumber(): number {
        return this.minSequenceNumber;
    }

    constructor(
        private baseSequenceNumber: number,
        pendingMessages: protocol.ISequencedDocumentMessage[],
        private deltaStorage: storage.IDocumentDeltaStorageService,
        private deltaConnection: storage.IDocumentDeltaConnection,
        private handler: (message: protocol.ISequencedDocumentMessage) => Promise<void>) {

        // The MSN starts at the base the manager is initialized to
        this.minSequenceNumber = this.baseSequenceNumber;
        this.lastSequenceNumber = this.baseSequenceNumber;

        this.q = queue<protocol.ISequencedDocumentMessage, void>((op, callback) => {
            // Handle the op
            this.processMessage(op).then(
                () => {
                    callback();
                },
                (error) => {
                    callback(error);
                });
        }, 1);

        // We start the queue as paused and rely on the client to start it
        this.q.pause();

        // When the queue is drained reset our timer
        this.q.drain = () => {
            this.q.resume();
        };

        // Prime the DeltaManager with the initial set of provided messages
        this.enqueueMessages(pendingMessages);

        // listen for new messages
        this.deltaConnection.on("op", (messages: protocol.ISequencedDocumentMessage[]) => {
            this.enqueueMessages(messages);
        });
    }

    public start() {
        this.q.resume();
    }

    /**
     * Submits a new delta operation
     */
    public submit(type: string, contents: any): Promise<void> {
        // Start adding trace for the op.
        const traces: protocol.ITrace[] = [ { service: "client", action: "start", timestamp: Date.now()}];
        const message: protocol.IDocumentMessage = {
            clientSequenceNumber: this.clientSequenceNumber++,
            contents,
            encrypted: this.deltaConnection.encrypted,
            encryptedContents: null,
            referenceSequenceNumber: this.baseSequenceNumber,
            traces,
            type,
        };

        this.readonly = false;
        this.stopSequenceNumberUpdate();
        return this.deltaConnection.submit(message);
    }

    /**
     * Submits an acked roundtrip operation.
     */
    public async submitRoundtrip(type: string, contents: protocol.ILatencyMessage) {
        const message: protocol.IDocumentMessage = {
            clientSequenceNumber: -1,
            contents: null,
            encrypted: this.deltaConnection.encrypted,
            encryptedContents: null,
            referenceSequenceNumber: -1,
            traces: contents.traces,
            type,
        };

        this.readonly = false;
        this.deltaConnection.submit(message);
    }

    private enqueueMessages(messages: protocol.ISequencedDocumentMessage[]) {
        for (const message of messages) {
            // Check that the messages are arriving in the expected order
            if (message.sequenceNumber !== this.lastSequenceNumber + 1) {
                this.handleOutOfOrderMessage(message);
            } else {
                this.lastSequenceNumber = message.sequenceNumber;
                this.q.push(message);
            }
        }
    }

    private async processMessage(message: protocol.ISequencedDocumentMessage): Promise<void> {
        assert.equal(message.sequenceNumber, this.baseSequenceNumber + 1);

        // Watch the minimum sequence number and be ready to update as needed
        this.minSequenceNumber = message.minimumSequenceNumber;
        this.baseSequenceNumber = message.sequenceNumber;

        // TODO handle error cases, NACK, etc...
        await this.handler(message);

        // We will queue a message to update our reference sequence number upon receiving a server operation. This
        // allows the server to know our true reference sequence number and be able to correctly update the minimum
        // sequence number (MSN). We don't ackowledge other message types similarly (like a min sequence number update)
        // to avoid ackowledgement cycles (i.e. ack the MSN update, which updates the MSN, then ack the update, etc...).
        if (message.type !== protocol.NoOp) {
            this.updateSequenceNumber();
        }
    }

    /**
     * Handles an out of order message retrieved from the server
     */
    private handleOutOfOrderMessage(message: protocol.ISequencedDocumentMessage) {
        if (message.sequenceNumber <= this.lastSequenceNumber) {
            debug(`Received duplicate message ${message.sequenceNumber}`);
            return;
        }

        debug(`Received out of order message ${message.sequenceNumber} ${this.lastSequenceNumber}`);
        this.pending.push(message);
        this.fetchMissingDeltas(this.lastSequenceNumber, message.sequenceNumber);
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
        this.enqueueMessages(messages);

        // Then sort pending operations and attempt to apply them again.
        // This could be optimized to stop handling messages once we realize we need to fetch mising values.
        // But for simplicity, and because catching up should be rare, we just process all of them.
        const pendingSorted = this.pending.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        this.pending = [];
        this.enqueueMessages(pendingSorted);
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
        }, 2000 + 1000);

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
