import * as assert from "assert";
import * as queue from "async/queue";
import { EventEmitter } from "events";
import cloneDeep = require("lodash/cloneDeep");
import { Deferred } from "../core-utils";
import { debug } from "./debug";
import { IDeltaManager, IDeltaQueue } from "./document";
import * as protocol from "./protocol";
import * as storage from "./storage";

export interface IConnectionDetails {
    clientId: string;
    existing: boolean;
    parentBranch: string;
    user: protocol.IAuthenticatedUser;
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

    /**
     * Called when the connection to the manager is dropped
     */
    disconnect: (message: string) => void;

    /**
     * Called when the connection has been nacked
     */
    nack: (target: number) => void;
}

class DeltaConnection extends EventEmitter {
    public static async Connect(id: string, token: string, service: storage.IDocumentService) {
        const connection = await service.connectToDeltaStream(id, token);
        return new DeltaConnection(connection);
    }

    public get details(): IConnectionDetails {
        return this._details;
    }

    public get nacked(): boolean {
        return this._nacked;
    }

    public get connected(): boolean {
        return this._connected;
    }

    public get outbound(): IDeltaQueue {
        return this._outbound;
    }

    // tslint:disable:variable-name
    private _details: IConnectionDetails;
    private _nacked = false;
    private _connected = true;
    private _outbound: DeltaQueue<protocol.IDocumentMessage>;
    // tslint:enable:variable-name

    private constructor(private connection: storage.IDocumentDeltaConnection) {
        super();

        this._details = {
            clientId: connection.clientId,
            existing: connection.existing,
            parentBranch: connection.parentBranch,
            user: connection.user,
        };

        // listen for new messages
        connection.on("op", (documentId: string, messages: protocol.ISequencedDocumentMessage[]) => {
            this.emit("op", documentId, messages);
        });

        connection.on("nack", (documentId: string, message: protocol.INack[]) => {
            // Mark nacked and also pause any outbound communication
            this._nacked = true;
            this._outbound.pause();

            const target = message[0].sequenceNumber;
            this.emit("nack", target);
        });

        connection.on("disconnect", (reason) => {
            this._connected = false;
            this.emit("disconnect", reason);
        });

        // Listen for socket.io latency messages
        connection.on("pong", (latency: number) => {
            // debug(`PONG ${this.details.clientId} ${latency}`);
        });

        // Queue for outbound message processing
        this._outbound = new DeltaQueue<protocol.IDocumentMessage>((op, callback) => {
            connection.submit(op);
            callback();
        });
    }

    /**
     * Closes the delta connection. This disconnects the socket and clears any listeners
     */
    public close() {
        this._connected = false;
        this.connection.disconnect();
        this.removeAllListeners();
    }

    public submit(message: protocol.IDocumentMessage): void {
        this._outbound.push(message);
    }
}

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
    // tslint:enable:variable-name

    private connection: DeltaConnection;

    public get inbound(): IDeltaQueue {
        return this._inbound;
    }

    public get outbound(): IDeltaQueue {
        return this.connection.outbound;
    }

    public get referenceSequenceNumber(): number {
        return this.baseSequenceNumber;
    }

    public get minimumSequenceNumber(): number {
        return this.minSequenceNumber;
    }

    constructor(
        private id: string,
        private baseSequenceNumber: number,
        pendingMessages: protocol.ISequencedDocumentMessage[],
        private deltaStorage: storage.IDocumentDeltaStorageService,
        private service: storage.IDocumentService,
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

        // Both queues start
        this._inbound.pause();

        // Prime the DeltaManager with the initial set of provided messages
        this.enqueueMessages(pendingMessages);
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
    public submit(type: string, contents: any): void {
        // Start adding trace for the op.
        const traces: protocol.ITrace[] = [ { service: "client", action: "start", timestamp: Date.now()}];
        const message: protocol.IDocumentMessage = {
            clientSequenceNumber: ++this.clientSequenceNumber,
            contents,
            referenceSequenceNumber: this.baseSequenceNumber,
            traces,
            type,
        };

        this.readonly = false;
        this.stopSequenceNumberUpdate();
        this.connection.submit(message);
    }

    /**
     * Submits an acked roundtrip operation.
     */
    public async submitRoundtrip(type: string, contents: protocol.ILatencyMessage) {
        const message: protocol.IDocumentMessage = {
            clientSequenceNumber: -1,
            contents: null,
            referenceSequenceNumber: -1,
            traces: contents.traces,
            type,
        };

        this.readonly = false;
        this.connection.submit(message);
    }

    public async connect(token: string): Promise<IConnectionDetails> {
        // Free up and clear any previous connection
        if (this.connection) {
            this.connection.close();
            this.connection = null;
        }

        this.connection = await DeltaConnection.Connect(this.id, token, this.service);
        this.clientSequenceNumber = 0;

        this.connection.on("op", (documentId: string, messages: protocol.ISequencedDocumentMessage[]) => {
            this.enqueueMessages(cloneDeep(messages));
        });

        this.connection.on("nack", (target: number) => {
            this.handler.nack(target);
        });

        this.connection.on("disconnect", (reason) => {
            this.handler.disconnect(reason);
        });

        return this.connection.details;
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

        debug(`${this.id} out of order message ${message.sequenceNumber} ${this.lastQueuedSequenceNumber}`);
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
