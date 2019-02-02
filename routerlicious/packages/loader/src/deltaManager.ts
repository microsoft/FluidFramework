import * as runtime from "@prague/runtime-definitions";
import { Deferred, isSystemType } from "@prague/utils";
import * as assert from "assert";
import { EventEmitter } from "events";
import { ContentCache } from "./contentCache";
import { debug } from "./debug";
import { DeltaConnection, IConnectionDetails } from "./deltaConnection";
import { DeltaQueue } from "./deltaQueue";

const MaxReconnectDelay = 8000;
const InitialReconnectDelay = 1000;
const MissingFetchDelay = 100;
const MaxFetchDelay = 10000;
const MaxBatchDeltas = 2000;
const DefaultChunkSize = 16 * 1024;

// TODO (mdaumi): These two should come from connect protocol. For now, splitting will never occur since
// it's bigger than DefaultChunkSize
const DefaultMaxContentSize = 32 * 1024;
const DefaultContentBufferSize = 10;

// tslint:disable no-unsafe-any

/**
 * Interface used to define a strategy for handling incoming delta messages
 */
export interface IDeltaHandlerStrategy {
    /**
     * Preparess data necessary to process the message. The return value of the method will be passed to the process
     * function.
     */
    prepare: (message: runtime.ISequencedDocumentMessage) => Promise<any>;

    /**
     * Processes the message. The return value from prepare is passed in the context parameter.
     */
    process: (message: runtime.ISequencedDocumentMessage, context: any) => void;
}

/**
 * Manages the flow of both inbound and outbound messages. This class ensures that collaborative objects receive delta
 * messages in order regardless of possible network conditions or timings causing out of order delivery.
 */
export class DeltaManager extends EventEmitter implements runtime.IDeltaManager {
    private pending: runtime.ISequencedDocumentMessage[] = [];
    private fetching = false;

    // Flag indicating whether or not we need to udpate the reference sequence number
    private updateHasBeenRequested = false;
    private updateSequenceNumberTimer: any;

    // Flag indicating whether the client is only a receiving client. Client starts in readonly mode.
    // Switches only on self client join message or on message submission.
    private readonly = true;

    // The minimum sequence number and last sequence number received from the server
    private minSequenceNumber = 0;

    private heartbeatTimer: NodeJS.Timer;

    // There are three numbers we track
    // * lastQueuedSequenceNumber is the last queued sequence number
    // * largestSequenceNumber is the largest seen sequence number
    private lastQueuedSequenceNumber: number;
    private largestSequenceNumber: number;
    private baseSequenceNumber: number;

    // tslint:disable:variable-name
    private _inbound: DeltaQueue<runtime.IDocumentMessage>;
    private _outbound: DeltaQueue<runtime.IDocumentMessage>;
    private _clientType: string;
    // tslint:enable:variable-name

    private connecting: Deferred<IConnectionDetails>;
    private connection: DeltaConnection;
    private clientSequenceNumber = 0;
    private closed = false;

    private handler: IDeltaHandlerStrategy;
    private deltaStorageP: Promise<runtime.IDocumentDeltaStorageService>;

    private contentCache = new ContentCache(DefaultContentBufferSize);

    public get inbound(): runtime.IDeltaQueue {
        return this._inbound;
    }

    public get outbound(): runtime.IDeltaQueue {
        return this._outbound;
    }

    public get referenceSequenceNumber(): number {
        return this.baseSequenceNumber;
    }

    public get minimumSequenceNumber(): number {
        return this.minSequenceNumber;
    }

    public get maxMessageSize(): number {
        assert(this.connection);
        return this.connection.details.maxMessageSize || DefaultChunkSize;
    }

    // TODO (mdaumi): This should be instantiated as a part of connection protocol.
    public get maxContentSize(): number {
        return DefaultMaxContentSize;
    }

    public get clientType(): string {
        return this._clientType;
    }

    constructor(
        private id: string,
        private tenantId: string,
        private tokenProvider: runtime.ITokenProvider,
        private service: runtime.IDocumentService,
        private client: runtime.IClient) {
        super();

        /* tslint:disable:strict-boolean-expressions */
        this._clientType = (!this.client || this.client.type === runtime.Browser)
            ? runtime.Browser
            : runtime.Robot;
        // Inbound message queue
        this._inbound = new DeltaQueue<runtime.ISequencedDocumentMessage>((op, callback) => {
            if (op.contents === undefined) {
                this.handleOpContent(op, callback);
            } else {
                this.processInboundOp(op, callback);
            }
        });

        this._inbound.on("error", (error) => {
            this.emit("error", error);
        });

        // Outbound message queue
        this._outbound = new DeltaQueue<runtime.IDocumentMessage>(
            (message, callback: (error?) => void) => {
                if (this.shouldSplit(message.contents)) {
                    debug(`Splitting content from envelope.`);
                    this.connection.submitAsync(message).then(
                        () => {
                            this.contentCache.set({
                                clientId: this.connection.details.clientId,
                                clientSequenceNumber: message.clientSequenceNumber,
                                contents: message.contents as string,
                            });
                            message.contents = undefined;
                            this.connection.submit(message);
                            callback();
                        },
                        (error) => {
                            callback(error);
                        });
                } else {
                    this.connection.submit(message);
                    callback();
                }
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
        debug("Attached op handler", sequenceNumber);

        // The MSN starts at the base the manager is initialized to
        this.baseSequenceNumber = sequenceNumber;
        this.minSequenceNumber = sequenceNumber;
        this.lastQueuedSequenceNumber = sequenceNumber;
        this.largestSequenceNumber = sequenceNumber;
        this.handler = handler;

        // We are ready to process inbound messages
        this._inbound.systemResume();

        this.fetchMissingDeltas(sequenceNumber);
    }

    public async connect(reason: string): Promise<IConnectionDetails> {
        if (this.connecting) {
            return this.connecting.promise;
        }

        // Connect to the delta storage endpoint
        const storageDeferred = new Deferred<runtime.IDocumentDeltaStorageService>();
        this.deltaStorageP = storageDeferred.promise;
        this.service.connectToDeltaStorage(this.tenantId, this.id, this.tokenProvider).then(
            (deltaStorage) => {
                storageDeferred.resolve(deltaStorage);
            },
            (error) => {
                // Could not get delta storage promise. For now we assume this is not possible and so simply
                // emit the error.
                this.emit("error", error);
            });

        this.connecting = new Deferred<IConnectionDetails>();
        this.connectCore(reason, InitialReconnectDelay);

        return this.connecting.promise;
    }

    public submit(type: runtime.MessageType, contents: string): number {
        // Start adding trace for the op.
        const traces: runtime.ITrace[] = [
            {
                action: "start",
                service: this._clientType,
                timestamp: Date.now(),
            }];
        // tslint:disable:no-increment-decrement
        const coreMessage: runtime.IDocumentMessage = {
            clientSequenceNumber: ++this.clientSequenceNumber,
            contents,
            referenceSequenceNumber: this.baseSequenceNumber,
            traces,
            type,
        };

        const message = this.createOutboundMessage(type, coreMessage);
        this.readonly = false;

        this.stopSequenceNumberUpdate();
        this._outbound.push(message);

        return message.clientSequenceNumber;
    }

    /* tslint:disable:promise-function-async */
    public getDeltas(from: number, to?: number): Promise<runtime.ISequencedDocumentMessage[]> {
        const deferred = new Deferred<runtime.ISequencedDocumentMessage[]>();
        this.getDeltasCore(from, to, [], deferred, 0);

        return deferred.promise;
    }

    public enableReadonlyMode() {
        this.stopHeartbeatSending();
        this.stopSequenceNumberUpdate();
        this.readonly = true;
    }

    public disableReadonlyMode() {
        this.readonly = false;
    }

    /**
     * Closes the connection and clears inbound & outbound queues.
     */
    public close() {
        this.closed = true;
        this.stopHeartbeatSending();
        this.stopSequenceNumberUpdate();
        if (this.connection) {
            this.connection.close();
        }
        this._inbound.clear();
        this._outbound.clear();
        this.removeAllListeners();
    }

    private shouldSplit(contents: string) {
        return (contents) && (contents.length > this.maxContentSize);
    }

    // Specific system level message attributes are need to be looked at by the server.
    // Hence they are separated and promoted as top level attributes.
    private createOutboundMessage(
        type: runtime.MessageType,
        coreMessage: runtime.IDocumentMessage): runtime.IDocumentMessage {
        if (isSystemType(type)) {
            const data = coreMessage.contents;
            coreMessage.contents = null;
            const outboundMessage: runtime.IDocumentSystemMessage = {
                ...coreMessage,
                data,
            };
            return outboundMessage;
        } else {
            return coreMessage;
        }
    }

    private getDeltasCore(
        from: number,
        to: number,
        allDeltas: runtime.ISequencedDocumentMessage[],
        deferred: Deferred<runtime.ISequencedDocumentMessage[]>,
        retry: number) {
        if (this.closed) {
            return;
        }

        const maxFetchTo = from + MaxBatchDeltas;

        // Grab a chunk of deltas - limit the number fetched to MaxBatchDeltas
        const deltasP = this.deltaStorageP.then((deltaStorage) => {
            const fetchTo = to === undefined ? maxFetchTo : Math.min(maxFetchTo, to);
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
                if ((to === undefined && maxFetchTo !== lastFetch + 1) || to === lastFetch + 1) {
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

        /* tslint:disable:no-floating-promises */
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

    private connectCore(reason: string, delay: number) {
        // Reconnection is only enabled for browser clients.
        const reconnect = this._clientType === runtime.Browser;

        DeltaConnection.Connect(
            this.tenantId,
            this.id,
            this.tokenProvider,
            this.service,
            this.client).then(
            (connection) => {
                this.connection = connection;

                this._outbound.systemResume();

                this.clientSequenceNumber = 0;

                // If first connection resolve the promise with the details
                if (this.connecting) {
                    this.connecting.resolve(connection.details);
                    this.connecting = null;
                }

                connection.on("op", (documentId: string, messages: runtime.ISequencedDocumentMessage[]) => {
                    // Need to buffer messages we receive before having the point set
                    if (this.handler) {
                        this.enqueueMessages(messages);
                    }
                });

                connection.on("op-content", (message: runtime.IContentMessage) => {
                    // Need to buffer messages we receive before having the point set
                    if (this.handler) {
                        this.contentCache.set(message);
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
                        this.connectCore("Reconnecting on nack", InitialReconnectDelay);
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
                        this.connectCore("Reconnecting on disconnect", InitialReconnectDelay);
                    }
                });

                connection.on("pong", (latency) => {
                    this.emit("pong", latency);
                });

                this.processInitialOps(connection.details.initialMessages, connection.details.initialContents);

                // Notify of the connection
                this.emit("connect", connection.details);
            },
            (error) => {
                // tslint:disable-next-line:no-parameter-reassignment
                delay = Math.min(delay, MaxReconnectDelay);
                // tslint:disable-next-line:no-parameter-reassignment
                reason = `Connection failed - trying again in ${delay}ms`;
                debug(reason, error);
                setTimeout(() => this.connectCore(reason, delay * 2), delay);
            });
    }

    private processInitialOps(messages: runtime.ISequencedDocumentMessage[], contents: runtime.IContentMessage[]) {
        // confirm the status of the handler and inbound queue
        if (!this.handler || this._inbound.paused) {
            // process them once the queue is ready
            this._inbound.once("resume", () => {
                this.enqueInitalOps(messages, contents);
            });
        } else {
            this.enqueInitalOps(messages, contents);
        }
    }

    private enqueInitalOps(messages: runtime.ISequencedDocumentMessage[], contents: runtime.IContentMessage[]) {
        if (contents && contents.length > 0) {
            for (const content of contents) {
                this.contentCache.set(content);
            }
        }
        if (messages && messages.length > 0) {
            this.catchUp(messages);
        }
    }

    private handleOpContent(op: runtime.ISequencedDocumentMessage, callback: (error?) => void) {
        const opContent = this.contentCache.peek(op.clientId);
        if (!opContent) {
            this.waitForContent(op.clientId, op.clientSequenceNumber, op.sequenceNumber).then((content) => {
                this.mergeAndProcess(op, content, callback);
            }, (err) => {
                callback(err);
            });
        } else if (opContent.clientSequenceNumber > op.clientSequenceNumber) {
            this.fetchContent(op.clientId, op.clientSequenceNumber, op.sequenceNumber).then((content) => {
                this.mergeAndProcess(op, content, callback);
            }, (err) => {
                callback(err);
            });
        } else if (opContent.clientSequenceNumber < op.clientSequenceNumber) {
            let nextContent = this.contentCache.get(op.clientId);
            while (nextContent && nextContent.clientSequenceNumber < op.clientSequenceNumber) {
                nextContent = this.contentCache.get(op.clientId);
            }
            assert(nextContent, "No content found");
            assert.equal(op.clientSequenceNumber, nextContent.clientSequenceNumber, "Invalid op content order");
            this.mergeAndProcess(op, nextContent, callback);
        } else {
            this.mergeAndProcess(op, this.contentCache.get(op.clientId), callback);
        }
    }

    private processInboundOp(op: runtime.ISequencedDocumentMessage, callback: (error?) => void) {
        this.processMessage(op).then(
            () => {
                callback();
            },
            (error) => {
                /* tslint:disable:no-unsafe-any */
                callback(error);
            });
    }

    private mergeAndProcess(message: runtime.ISequencedDocumentMessage, contentOp: runtime.IContentMessage, callback) {
        message.contents = contentOp.contents;
        this.processInboundOp(message, callback);
    }

    private enqueueMessages(messages: runtime.ISequencedDocumentMessage[]) {
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

    private processMessage(message: runtime.ISequencedDocumentMessage): Promise<void> {
        assert.equal(message.sequenceNumber, this.baseSequenceNumber + 1);
        const startTime = Date.now();

        // Back-compat: Client might open an old document.
        if (message.contents &&
            typeof message.contents === "string" &&
            message.type !== runtime.MessageType.ClientLeave) {
            message.contents = JSON.parse(message.contents);
        }

        // TODO handle error cases, NACK, etc...
        const contextP = this.handler.prepare(message);
        return contextP.then((context) => {
            // Add final ack trace.
            if (message.traces && message.traces.length > 0) {
                message.traces.push({
                    action: "end",
                    service: this._clientType,
                    timestamp: Date.now(),
                });
            }

            // Watch the minimum sequence number and be ready to update as needed
            this.minSequenceNumber = message.minimumSequenceNumber;
            this.baseSequenceNumber = message.sequenceNumber;

            this.handler.process(message, context);

            // We will queue a message to update our reference sequence number upon receiving a server operation. This
            // allows the server to know our true reference sequence number and be able to correctly update the minimum
            // sequence number (MSN). We don't ackowledge other message types similarly (like a min sequence number
            // update) to avoid ackowledgement cycles (i.e. ack the MSN update, which updates the MSN, then ack the
            // update, etc...).
            if (message.type === runtime.MessageType.Operation ||
                message.type === runtime.MessageType.Propose) {
                this.updateSequenceNumber();
            }

            const endTime = Date.now();
            this.emit("processTime", endTime - startTime);
        });
    }

    /**
     * Handles an out of order message retrieved from the server
     */
    private handleOutOfOrderMessage(message: runtime.ISequencedDocumentMessage) {
        if (message.sequenceNumber <= this.lastQueuedSequenceNumber) {
            debug(`${this.tenantId}/${this.id} Received duplicate message ${message.sequenceNumber}`);
            return;
        }

        // tslint:disable-next-line:max-line-length
        debug(`${this.tenantId}/${this.id} out of order message ${message.sequenceNumber} ${this.lastQueuedSequenceNumber}`);
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
                debug(error.toString());
                this.fetching = false;
                this.fetchMissingDeltas(from, to);
            });
    }

    private async waitForContent(
        clientId: string,
        clientSeqNumber: number,
        seqNumber: number): Promise<runtime.IContentMessage> {
        return new Promise<runtime.IContentMessage>((resolve, reject) => {
            const lateContentHandler = (clId: string) => {
                if (clientId === clId) {
                    const lateContent = this.contentCache.peek(clId);
                    if (lateContent && lateContent.clientSequenceNumber === clientSeqNumber) {
                        this.contentCache.removeListener("content", lateContentHandler);
                        debug(`Late content fetched from buffer ${clientId}: ${clientSeqNumber}`);
                        resolve(this.contentCache.get(clientId));
                    }
                }
            };
            this.contentCache.on("content", lateContentHandler);
            this.fetchContent(clientId, clientSeqNumber, seqNumber).then((content) => {
                this.contentCache.removeListener("content", lateContentHandler);
                resolve(content);
            });

        });
    }

    private async fetchContent(
        clientId: string,
        clientSeqNumber: number,
        seqNumber: number): Promise<runtime.IContentMessage> {
        return new Promise<runtime.IContentMessage>((resolve, reject) => {
            this.getDeltas(seqNumber, seqNumber).then(
                (messages) => {
                    assert.ok(messages.length > 0, "Content not found in DB");
                    const message = messages[0];
                    assert.equal(message.clientId, clientId, "Invalid fetched content");
                    assert.equal(message.clientSequenceNumber, clientSeqNumber, "Invalid fetched content");
                    debug(`Late content fetched from DB ${clientId}: ${clientSeqNumber}`);
                    resolve({
                        clientId: message.clientId,
                        clientSequenceNumber: message.clientSequenceNumber,
                        contents: message.contents,
                    });
                },
                (error) => {
                    // Retry on failure
                    debug(error.toString());
                    this.fetchContent(clientId, clientSeqNumber, seqNumber);
                });
        });
    }

    private catchUp(messages: runtime.ISequencedDocumentMessage[]) {
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
        if (!this.heartbeatTimer) {
            this.heartbeatTimer = setTimeout(
                () => {
                    this.submit(runtime.MessageType.NoOp, null);
                    this.heartbeatTimer = undefined;
                },
                2000 + 1000);
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
                this.submit(runtime.MessageType.NoOp, null);
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

    private stopHeartbeatSending() {
        clearTimeout(this.heartbeatTimer);
        this.heartbeatTimer = undefined;
    }
}
