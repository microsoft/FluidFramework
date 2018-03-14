import * as assert from "assert";
import * as queue from "async/queue";
import { EventEmitter } from "events";
import extend = require("lodash/extend");
import { Deferred } from "../core-utils";
import { debug } from "./debug";
import * as protocol from "./protocol";
import * as storage from "./storage";

export interface IDeltaManager {
    // The queue of inbound delta messages
    inbound: IDeltaQueue;

    // the queue of outbound delta messages
    outbound: IDeltaQueue;
}

export interface IDeltaQueue extends EventEmitter {
    /**
     * Flag indicating whether or not the queue was paused
     */
    paused: boolean;

    /**
     * The number of messages remaining in the queue
     */
    length: number;

    /**
     * Pauses processing on the queue
     */
    pause();

    /**
     * Resumes processing on the queue
     */
    resume();
}

class DeltaQueue<T> extends EventEmitter implements IDeltaQueue {
    private q: async.AsyncQueue<T>;

    public get paused(): boolean {
        return this.q.paused;
    }

    public get length(): number {
        return this.q.length();
    }

    constructor(worker: async.AsyncWorker<T, void>) {
        super();
        this.q = queue<T, void>((task, callback) => {
            this.emit("pre-op", task);
            worker(task, (error) => {
                this.emit("op", task);
                callback(error);
            });
        });

        this.q.error = (error) => {
            debug(`Queue processing error`, error);
            this.q.pause();
        };
    }

    public push(task: T) {
        this.q.push(task);
    }

    public pause() {
        this.q.pause();
        this.emit("pause");
    }

    public resume() {
        this.q.resume();
        this.emit("resume");
    }
}

/**
 * Interface used to define a strategy for handling incoming delta messages
 */
export interface IDeltaHandlerStrategy {
    /**
     * Preparess data necessary to process the message. The return value of the method will be passed to the process
     * function.
     */
    prepare: (message: protocol.ISequencedDocumentMessage) => Promise<any>;

    /**
     * Processes the message. The return value from prepare is passed in the context parameter.
     */
    process: (message: protocol.ISequencedDocumentMessage, context: any) => void;
}

type OutboundMessage = protocol.IDocumentMessage & { _deferred: Deferred<void> };

/**
 * Helper class that manages incoming delta messages. This class ensures that collaborative objects receive delta
 * messages in order regardless of possible network conditions or timings causing out of order delivery.
 */
export class DeltaManager implements IDeltaManager {
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

    // There are three numbers we track
    // * lastQueuedSequenceNumber is the last queued sequence number
    // * largestSequenceNumber is the largest seen sequence number
    private lastQueuedSequenceNumber: number;
    private largestSequenceNumber: number;

    private pauseDeferred: Deferred<void>;
    private pauseAtOffset: number;

    // tslint:disable:variable-name
    private _inbound: DeltaQueue<protocol.IDocumentMessage>;
    private _outbound: DeltaQueue<OutboundMessage>;
    // tslint:enable:variable-name

    public get inbound(): IDeltaQueue {
        return this._inbound;
    }

    public get outbound(): IDeltaQueue {
        return this._outbound;
    }

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
        private handler: IDeltaHandlerStrategy) {

        // The MSN starts at the base the manager is initialized to
        this.minSequenceNumber = this.baseSequenceNumber;
        this.lastQueuedSequenceNumber = this.baseSequenceNumber;
        this.largestSequenceNumber = this.baseSequenceNumber;

        // Queue for inbound message processing
        this._inbound = new DeltaQueue<protocol.ISequencedDocumentMessage>((op, callback) => {
            // Handle the op
            this.processMessage(op).then(
                () => {
                    if (this.pauseDeferred && this.pauseAtOffset === this.baseSequenceNumber) {
                        this.pauseDeferred.resolve();
                        this.pauseDeferred = undefined;
                        this.pauseAtOffset = undefined;
                        this._inbound.pause();
                    }
                    callback();
                },
                (error) => {
                    callback(error);
                });
        });

        // Queue for outbound message processing
        this._outbound = new DeltaQueue<OutboundMessage>((op, callback) => {
            const submitP = this.deltaConnection.submit(op);
            op._deferred.resolve(submitP);
            callback();
        });

        // We start the queue as paused and rely on the client to start it
        this._inbound.pause();

        // Prime the DeltaManager with the initial set of provided messages
        this.enqueueMessages(pendingMessages);

        // listen for new messages
        this.deltaConnection.on("op", (messages: protocol.ISequencedDocumentMessage[]) => {
            this.enqueueMessages(messages);
        });
    }

    /**
     * Flushes all pending tasks and returns a promise for when they are completed. The queue is marked as paused
     * upon return.
     */
    public flushAndPause(sequenceNumber = this.largestSequenceNumber): Promise<void> {
        // If the queue is caught up we can simply pause it and return. Otherwise we need to indicate when in the
        // stream to perform the pause
        if (sequenceNumber <= this.baseSequenceNumber) {
            this._inbound.pause();
            return;
        } else {
            this.pauseAtOffset = sequenceNumber;
            this.pauseDeferred = new Deferred<void>();
            return this.pauseDeferred.promise;
        }
    }

    public start() {
        this._inbound.resume();
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
        return this.submitCore(message);
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
        return this.submitCore(message);
    }

    /**
     * Begins to submit a new message to the server
     */
    private submitCore(message: protocol.IDocumentMessage): Promise<void> {
        const deferred = new Deferred<void>();
        const task = extend(message, { _deferred: deferred });
        this._outbound.push(task);
        return deferred.promise;
    }

    private enqueueMessages(messages: protocol.ISequencedDocumentMessage[]) {
        for (const message of messages) {
            this.largestSequenceNumber = Math.max(this.largestSequenceNumber, message.sequenceNumber);
            // Check that the messages are arriving in the expected order
            if (message.sequenceNumber !== this.lastQueuedSequenceNumber + 1) {
                this.handleOutOfOrderMessage(message);
            } else {
                this.lastQueuedSequenceNumber = message.sequenceNumber;
                this._inbound.push(message);
            }
        }
    }

    private async processMessage(message: protocol.ISequencedDocumentMessage): Promise<void> {
        assert.equal(message.sequenceNumber, this.baseSequenceNumber + 1);

        // TODO handle error cases, NACK, etc...
        const context = await this.handler.prepare(message);

        // Watch the minimum sequence number and be ready to update as needed
        this.minSequenceNumber = message.minimumSequenceNumber;
        this.baseSequenceNumber = message.sequenceNumber;

        this.handler.process(message, context);

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
        if (message.sequenceNumber <= this.lastQueuedSequenceNumber) {
            debug(`Received duplicate message ${message.sequenceNumber}`);
            return;
        }

        debug(`Received out of order message ${message.sequenceNumber} ${this.lastQueuedSequenceNumber}`);
        this.pending.push(message);
        this.fetchMissingDeltas(this.lastQueuedSequenceNumber, message.sequenceNumber);
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
