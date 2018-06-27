import * as assert from "assert";
import { EventEmitter } from "events";
import cloneDeep = require("lodash/cloneDeep");
import { Deferred } from "../core-utils";
import { Browser, IWorkerClient } from "./client";
import { debug } from "./debug";
import { DeltaConnection, IConnectionDetails } from "./deltaConnection";
import { DeltaQueue } from "./deltaQueue";
import { IDeltaManager, IDeltaQueue } from "./document";
import * as protocol from "./protocol";
import * as storage from "./storage";

const MaxReconnectDelay = 8000;
const InitialReconnectDelay = 1000;
const MissingFetchDelay = 100;
const MaxFetchDelay = 10000;
const MaxBatchDeltas = 2000;

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

/**
 * Manages the flow of both inbound and outbound messages. This class ensures that collaborative objects receive delta
 * messages in order regardless of possible network conditions or timings causing out of order delivery.
 */
export class DeltaManager extends EventEmitter implements IDeltaManager {
    private pending: protocol.ISequencedDocumentMessage[] = [];
    private fetching = false;

    // Flag indicating whether or not we need to udpate the reference sequence number
    private updateHasBeenRequested = false;
    private updateSequenceNumberTimer: any;

    // Flag indicating whether the client has only received messages
    private readonly = true;

    // The minimum sequence number and last sequence number received from the server
    private minSequenceNumber = 0;

    private heartbeatTimer: any;

    // There are three numbers we track
    // * lastQueuedSequenceNumber is the last queued sequence number
    // * largestSequenceNumber is the largest seen sequence number
    private lastQueuedSequenceNumber: number;
    private largestSequenceNumber: number;
    private baseSequenceNumber: number;

    // tslint:disable:variable-name
    private _inbound: DeltaQueue<protocol.IDocumentMessage>;
    private _outbound: DeltaQueue<protocol.IDocumentMessage>;
    // tslint:enable:variable-name

    private connecting: Deferred<IConnectionDetails>;
    private connection: DeltaConnection;
    private clientSequenceNumber = 0;

    private handler: IDeltaHandlerStrategy;
    private deltaStorageP: Promise<storage.IDocumentDeltaStorageService>;

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

    public get clientId(): string {
        return this.connection ? this.connection.details.clientId : "disconnected";
    }

    public get allOpsAcked(): boolean {
        return this._inbound.empty;
    }

    constructor(private id: string, private tenantId: string, private service: storage.IDocumentService) {
        super();

        // Inbound message queue
        this._inbound = new DeltaQueue<protocol.ISequencedDocumentMessage>((op, callback) => {
            this.processMessage(op).then(
                () => {
                    callback();
                },
                (error) => {
                    callback(error);
                });
        });

        this._inbound.on("error", (error) => {
            this.emit("error", error);
        });

        // Outbound message queue
        this._outbound = new DeltaQueue<protocol.IDocumentMessage>((message, callback) => {
            this.connection.submit(message);
            callback();
        });

        this._outbound.on("error", (error) => {
            this.emit("error", error);
        });

        // Require the user to start the processing
        this._inbound.pause();
        this._outbound.pause();
    }

    /**
     * Sets the sequence number from which inbound messages should be returned
     */
    public attachOpHandler(sequenceNumber: number, handler: IDeltaHandlerStrategy) {
        // The MSN starts at the base the manager is initialized to
        this.baseSequenceNumber = sequenceNumber;
        this.minSequenceNumber = this.baseSequenceNumber;
        this.lastQueuedSequenceNumber = this.baseSequenceNumber;
        this.largestSequenceNumber = this.baseSequenceNumber;
        this.handler = handler;

        // We are ready to process inbound messages
        this._inbound.systemResume();

        this.fetchMissingDeltas(sequenceNumber);
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
        this._outbound.push(message);
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
        this._outbound.push(message);
    }

    public async connect(reason: string, token: string, client: IWorkerClient): Promise<IConnectionDetails> {
        if (this.connecting) {
            return this.connecting.promise;
        }

        // Connect to the delta storage endpoint
        const storageDeferred = new Deferred<storage.IDocumentDeltaStorageService>();
        this.deltaStorageP = storageDeferred.promise;
        this.service.connectToDeltaStorage(this.tenantId, this.id, token).then(
            (deltaStorage) => {
                storageDeferred.resolve(deltaStorage);
            },
            (error) => {
                // Could not get delta storage promise. For now we assume this is not possible and so simply
                // emit the error.
                this.emit("error", error);
            });

        this.connecting = new Deferred<IConnectionDetails>();
        this.connectCore(token, reason, InitialReconnectDelay, client);

        return this.connecting.promise;
    }

    public getDeltas(from: number, to?: number): Promise<protocol.ISequencedDocumentMessage[]> {
        const deferred = new Deferred<protocol.ISequencedDocumentMessage[]>();
        this.getDeltasCore(from, to, [], deferred, 0);

        return deferred.promise;
    }

    public close() {
        if (this.connection) {
            this.connection.close();
        }
    }

    private getDeltasCore(
        from: number,
        to: number,
        allDeltas: protocol.ISequencedDocumentMessage[],
        deferred: Deferred<protocol.ISequencedDocumentMessage[]>,
        retry: number) {

        // Grab a chunk of deltas - limit the number fetched to MaxBatchDeltas
        const deltasP = this.deltaStorageP.then((deltaStorage) => {
            const fetchTo = to === undefined ? MaxBatchDeltas : Math.min(from + MaxBatchDeltas, to);
            return deltaStorage.get(from, fetchTo);
        });

        // Process the received deltas
        const replayP = deltasP.then(
            (deltas) => {
                allDeltas.push(...deltas);

                const lastFetch = deltas.length > 0 ? deltas[deltas.length - 1].sequenceNumber : from;

                // If we have no upper bound and fetched less than the max deltas - meaning we got as many as exit -
                // then we can resolve the promise. We also resolve if we fetched up to the expected to. Otherwise
                // we will look to try again
                if ((to === undefined && Math.max(0, lastFetch - from - 1) < MaxBatchDeltas) || to === lastFetch + 1) {
                    deferred.resolve(allDeltas);
                    return null;
                } else {
                    // Attempt to fetch more deltas. If we didn't recieve any in the previous call we up our retry
                    // count since something prevented us from seeing those deltas
                    return { from: lastFetch, to, retry: deltas.length === 0 ? retry + 1 : 0 };
                }
            },
            (error) => {
                // There was an error fetching the deltas. Up the retry counter
                return { from, to, retry: retry + 1 };
            });

        // If an error or we missed fetching ops - call back with a timer to fetch any missing values
        replayP.then(
            (replay) => {
                if (!replay) {
                    return;
                }

                const delay = Math.min(
                    MaxFetchDelay,
                    replay.retry !== 0 ? MissingFetchDelay * Math.pow(2, replay.retry) : 0);
                setTimeout(
                    () => this.getDeltasCore(replay.from, replay.to, allDeltas, deferred, replay.retry),
                    delay);
            });
    }

    private connectCore(token: string, reason: string, delay: number, client: IWorkerClient) {
        // Reconnection is only enabled for non robot clients.
        const reconnect = (client === undefined || client.type === Browser);
        DeltaConnection.Connect(this.tenantId, this.id, token, this.service, client).then(
            (connection) => {
                this.connection = connection;

                this._outbound.systemResume();

                this.clientSequenceNumber = 0;

                // If first connection resolve the promise with the details
                if (this.connecting) {
                    this.connecting.resolve(connection.details);
                    this.connecting = null;
                }

                connection.on("op", (documentId: string, messages: protocol.ISequencedDocumentMessage[]) => {
                    // Need to buffer messages we receive before having the point set
                    if (this.handler) {
                        this.enqueueMessages(cloneDeep(messages));
                    }
                });

                connection.on("nack", (target: number) => {
                    this._outbound.systemPause();
                    this._outbound.clear();

                    this.emit("disconnect", true);
                    if (!reconnect) {
                        this._inbound.systemPause();
                        this._inbound.clear();
                    } else {
                        this.connectCore(token, "Reconnecting", InitialReconnectDelay, client);
                    }
                });

                connection.on("disconnect", (disconnectReason) => {
                    this._outbound.systemPause();
                    this._outbound.clear();

                    this.emit("disconnect", false);
                    if (!reconnect) {
                        this._inbound.systemPause();
                        this._inbound.clear();
                    } else {
                        this.connectCore(token, "Reconnecting", InitialReconnectDelay, client);
                    }
                });

                // Notify of the connection
                this.emit("connect", connection.details);
            },
            (error) => {
                delay = Math.min(delay, MaxReconnectDelay);
                reason = `Connection failed - trying again in ${delay}ms`;
                debug(reason, error);
                setTimeout(() => this.connectCore(token, reason, delay * 2, client), delay);
            });
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

        this.getDeltas(from, to).then(
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
