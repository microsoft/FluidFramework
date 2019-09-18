/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    IConnectionDetails,
    IDeltaHandlerStrategy,
    IDeltaManager,
    IDeltaQueue,
    ITelemetryLogger,
} from "@prague/container-definitions";
import {
    Browser,
    ConnectionMode,
    IClient,
    IContentMessage,
    IDocumentDeltaStorageService,
    IDocumentMessage,
    IDocumentService,
    IDocumentSystemMessage,
    ISequencedDocumentMessage,
    IServiceConfiguration,
    ISignalMessage,
    ITrace,
    MessageType,
} from "@prague/protocol-definitions";
import { Deferred, isSystemType, PerformanceEvent } from "@prague/utils";
import * as assert from "assert";
import { EventEmitter } from "events";
import { ContentCache } from "./contentCache";
import { debug } from "./debug";
import { DeltaConnection } from "./deltaConnection";
import { DeltaQueue } from "./deltaQueue";
import { logNetworkFailure, waitForConnectedState } from "./networkUtils";
// tslint:disable-next-line:no-var-requires
const performanceNow = require("performance-now") as (() => number);

const MaxReconnectDelay = 8000;
const InitialReconnectDelay = 1000;
const MissingFetchDelay = 100;
const MaxFetchDelay = 10000;
const MaxBatchDeltas = 2000;
const DefaultChunkSize = 16 * 1024;

// This can be anything other than null
const ImmediateNoOpResponse = "";

const DefaultContentBufferSize = 10;

/**
 * Manages the flow of both inbound and outbound messages. This class ensures that shared objects receive delta
 * messages in order regardless of possible network conditions or timings causing out of order delivery.
 */
export class DeltaManager extends EventEmitter implements IDeltaManager<ISequencedDocumentMessage, IDocumentMessage> {
    public get disposed() { return this.isDisposed; }

    public readonly clientType: string;
    public get IDeltaSender() { return this; }

    // Current conneciton mode. Initially write.
    public connectionMode: ConnectionMode = "write";
    // Overwrites the current connection mode to always write.
    private readonly systemConnectionMode: ConnectionMode;

    private isDisposed: boolean = false;
    private pending: ISequencedDocumentMessage[] = [];
    private fetching = false;

    private inQuorum = false;

    // Flag indicating whether or not we need to update the reference sequence number
    private updateHasBeenRequested = false;
    private updateSequenceNumberTimer: any;

    // The minimum sequence number and last sequence number received from the server
    private minSequenceNumber: number = 0;

    // There are three numbers we track
    // * lastQueuedSequenceNumber is the last queued sequence number
    private lastQueuedSequenceNumber: number = 0;
    private baseSequenceNumber: number = 0;

    private readonly _inboundPending: DeltaQueue<ISequencedDocumentMessage>;
    private readonly _inbound: DeltaQueue<ISequencedDocumentMessage>;
    private readonly _inboundSignal: DeltaQueue<ISignalMessage>;
    private readonly _outbound: DeltaQueue<IDocumentMessage[]>;

    private connecting: Deferred<IConnectionDetails> | undefined;
    private connection: DeltaConnection | undefined;
    private clientSequenceNumber = 0;
    private clientSequenceNumberObserved = 0;
    private closed = false;

    private handler: IDeltaHandlerStrategy | undefined;
    private deltaStorageP: Promise<IDocumentDeltaStorageService> | undefined;

    private readonly contentCache = new ContentCache(DefaultContentBufferSize);

    private messageBuffer: IDocumentMessage[] = [];

    private pongCount: number = 0;
    private socketLatency = 0;

    private duplicateMsgCount = 0;

    private connectRepeatCount = 0;
    private connectStartTime = 0;

    // collab window tracking.
    // Start with 50 not to record anything below 50 (= 30 + 20).
    private collabWindowMax = 30;

    public get inbound(): IDeltaQueue<ISequencedDocumentMessage> {
        return this._inbound;
    }

    public get outbound(): IDeltaQueue<IDocumentMessage[]> {
        return this._outbound;
    }

    public get inboundSignal(): IDeltaQueue<ISignalMessage> {
        return this._inboundSignal;
    }

    public get referenceSequenceNumber(): number {
        return this.baseSequenceNumber;
    }

    public get minimumSequenceNumber(): number {
        return this.minSequenceNumber;
    }

    public get maxMessageSize(): number {
        return this.connection!.details.serviceConfiguration
            ? this.connection!.details.serviceConfiguration.maxMessageSize
            : this.connection!.details.maxMessageSize || DefaultChunkSize;
    }

    public get version(): string {
        return this.connection!.details.version;
    }

    public get serviceConfiguration(): IServiceConfiguration {
        return this.connection!.details.serviceConfiguration;
    }

    public get active(): boolean {
         return this.inQuorum && this.connectionMode === "write";
    }

    constructor(
        private readonly service: IDocumentService,
        private readonly client: IClient | null,
        private readonly logger: ITelemetryLogger,
        private readonly reconnect: boolean) {
        super();

        this.clientType = (!this.client || !this.client.type) ? Browser : this.client.type;
        this.systemConnectionMode = (this.client && this.client.mode === "write") ? "write" : "read";

        // Inbound message queue
        this._inboundPending = new DeltaQueue<ISequencedDocumentMessage>(
            (op, callback) => {
                // Explicitly split the two cases to avoid the async call in the case we are not split
                if (op!.contents === undefined) {
                    this.fetchOpContent(op).then(
                        (opContents) => {
                            op.contents = opContents.contents;
                            this._inbound.push(op);
                            callback();
                        },
                        (error) => {
                            callback(error);
                        });
                } else {
                    this._inbound.push(op);
                    callback();
                }
            });

        this._inbound = new DeltaQueue<ISequencedDocumentMessage>(
            (op, callback) => {
                try {
                    this.processMessage(op, callback);
                } catch (error) {
                    callback(error);
                }
            });

        this._inboundPending.on("error", (error) => {
            this.emit("error", error);
        });

        this._inbound.on("error", (error) => {
            this.emit("error", error);
        });

        // Outbound message queue. The outbound queue is represented as a queue of an array of ops. Ops contained
        // within an array *must* fit within the maxMessageSize and are guaranteed to be ordered sequentially.
        this._outbound = new DeltaQueue<IDocumentMessage[]>(
            (messages, callback: (error?) => void) => {
                if (this.shouldSplit(messages)) {
                    messages.forEach((message) => {
                        debug(`Splitting content from envelope.`);
                        this.connection!.submitAsync([message]).then(
                            () => {
                                this.contentCache.set({
                                    clientId: this.connection!.details.clientId,
                                    clientSequenceNumber: message!.clientSequenceNumber,
                                    contents: message!.contents as string,
                                });
                                message!.contents = undefined;
                                this.connection!.submit([message]);
                                callback();
                            },
                            (error) => {
                                callback(error);
                            });
                    });
                } else {
                    this.connection!.submit(messages);
                    callback();
                }
            });

        this._outbound.on("error", (error) => {
            this.emit("error", error);
        });

        // Inbound signal queue
        this._inboundSignal = new DeltaQueue<ISignalMessage>((message, callback: (error?) => void) => {
            // tslint:disable no-unsafe-any
            message!.content = JSON.parse(message!.content);
            this.handler!.processSignal(message!);
            callback();
        });

        this._inboundSignal.on("error", (error) => {
            this.emit("error", error);
        });

        // Require the user to start the processing
        this._inbound.pause();
        this._outbound.pause();
        this._inboundSignal.pause();
    }

    public dispose() {
        assert.fail("Not implemented.");
        this.isDisposed = true;
    }

    /**
     * Sets the sequence number from which inbound messages should be returned
     */
    public attachOpHandler(
            minSequenceNumber: number,
            sequenceNumber: number,
            handler: IDeltaHandlerStrategy,
            resume: boolean) {
        debug("Attached op handler", sequenceNumber);

        this.baseSequenceNumber = sequenceNumber;
        this.minSequenceNumber = minSequenceNumber;
        this.lastQueuedSequenceNumber = sequenceNumber;

        // we will use same check in other places to make sure all the seq number above are set properly.
        assert(!this.handler);
        this.handler = handler;
        assert(this.handler);

        // We are ready to process inbound messages
        if (resume) {
            this._inbound.systemResume();
            this._inboundSignal.systemResume();
            this.fetchMissingDeltas("DocumentOpen", sequenceNumber);
        }
    }

    public updateQuorumJoin() {
        this.inQuorum = true;
    }

    public updateQuorumLeave() {
        this.inQuorum = false;
    }

    public async connect(reason: string): Promise<IConnectionDetails> {
        if (this.connecting) {
            assert(!this.connection);
            return this.connecting.promise;
        }
        if (this.connection) {
            return this.connection.details;
        }

        this.connecting = new Deferred<IConnectionDetails>();
        this.connectCore(reason, InitialReconnectDelay, this.connectionMode);

        return this.connecting.promise;
    }

    public flush() {
        if (this.messageBuffer.length === 0) {
            return;
        }

        // The prepareFlush event allows listenerse to append metadata to the batch prior to submission.
        this.emit("prepareSend", this.messageBuffer);

        this._outbound.push(this.messageBuffer);
        this.messageBuffer = [];
    }

    public submit(type: MessageType, contents: any, batch = false, metadata?: any): number {
        // TODO need to fail if gets too large
        // const serializedContent = JSON.stringify(this.messageBuffer);
        // const maxOpSize = this.context.deltaManager.maxMessageSize;

        // Start adding trace for the op.
        const traces: ITrace[] = [
            {
                action: "start",
                service: this.clientType,
                timestamp: Date.now(),
            }];

        const message: IDocumentMessage = {
            clientSequenceNumber: ++this.clientSequenceNumber,
            contents: JSON.stringify(contents),
            metadata,
            referenceSequenceNumber: this.baseSequenceNumber,
            traces,
            type,
        };

        const outbound = this.createOutboundMessage(type, message);
        this.stopSequenceNumberUpdate();
        this.emit("submitOp", message);

        if (!batch) {
            this.flush();
            this.messageBuffer.push(outbound);
            this.flush();
        } else {
            this.messageBuffer.push(outbound);
        }

        return outbound.clientSequenceNumber;
    }

    public submitSignal(content: any) {
        if (this.connection) {
            this.connection.submitSignal(content);
        } else {
            this.logger.sendErrorEvent({eventName: "submitSignalDisconnected"});
        }
    }

    public async getDeltas(reason: string, fromInitial: number, to?: number): Promise<ISequencedDocumentMessage[]> {
        let retry: number = 0;
        let from: number = fromInitial;
        const allDeltas: ISequencedDocumentMessage[] = [];

        const telemetryEvent = PerformanceEvent.start(this.logger, {
            eventName: "GetDeltas",
            from,
            reason,
            to,
        });

        while (!this.closed) {
            const maxFetchTo = from + MaxBatchDeltas;
            const fetchTo = to === undefined ? maxFetchTo : Math.min(maxFetchTo, to);

            // Connect to the delta storage endpoint
            if (!this.deltaStorageP) {
                this.deltaStorageP = this.service.connectToDeltaStorage().catch(
                    (error) => {
                        this.emit("error", error);
                        throw error;
                    });
            }

            // Let exceptions here propagate through, without hitting retry logic below
            const deltaStorage = await this.deltaStorageP!;

            let deltasRetrievedLast = 0;
            let success = true;

            try {
                // Grab a chunk of deltas - limit the number fetched to MaxBatchDeltas
                const deltas = await deltaStorage.get(from, fetchTo);

                // Note that server (or driver code) can push here something unexpected, like undefined
                // Exception thrown as result of it will result in us retrying
                allDeltas.push(...deltas);

                deltasRetrievedLast = deltas.length;
                const lastFetch = deltasRetrievedLast > 0 ? deltas[deltasRetrievedLast - 1].sequenceNumber : from;

                // If we have no upper bound and fetched less than the max deltas - meaning we got as many as exit -
                // then we can resolve the promise. We also resolve if we fetched up to the expected to. Otherwise
                // we will look to try again
                if ((to === undefined && maxFetchTo !== lastFetch + 1) || to === lastFetch + 1) {
                    telemetryEvent.end({lastFetch, totalDeltas: allDeltas.length, retries: retry});
                    return allDeltas;
                }

                // Attempt to fetch more deltas. If we didn't receive any in the previous call we up our retry
                // count since something prevented us from seeing those deltas
                from = lastFetch;
            } catch (error) {
                // There was an error fetching the deltas. Up the retry counter
                logNetworkFailure(
                    this.logger,
                    {
                        eventName: "GetDeltasError",
                        fetchTo,
                        from,
                        retry: retry + 1,
                    },
                    error);
                success = false;
            }

            retry = deltasRetrievedLast === 0 ? retry + 1 : 0;
            const delay = Math.min(
                MaxFetchDelay,
                retry !== 0 ? MissingFetchDelay * Math.pow(2, retry) : 0);

            telemetryEvent.reportProgress({
                delay,
                deltasRetrievedLast,
                deltasRetrievedTotal: allDeltas.length,
                replayFrom: from,
                retry,
                success,
            });

            await waitForConnectedState(delay);
        }

        // Might need to change to non-error event
        this.logger.sendErrorEvent({eventName: "GetDeltasClosedConnection" });

        return [];
    }

    /**
     * Closes the connection and clears inbound & outbound queues.
     */
    public close(): void {
        this.closed = true;
        this.stopSequenceNumberUpdate();
        if (this.connection) {
            this.connection.close();
            this.connection = undefined;
        }

        if (this.connecting) {
            this.connecting.reject(new Error("Container closed"));
            this.connecting = undefined;
        }

        this._inbound.clear();
        this._outbound.clear();
        this._inboundSignal.clear();
        this.removeAllListeners();
    }

    private recordPingTime(latency: number) {
        this.pongCount++;
        this.socketLatency += latency;
        const aggregateCount = 100;
        if (this.pongCount === aggregateCount) {
            this.logger.sendTelemetryEvent({eventName: "DeltaLatency", value: this.socketLatency / aggregateCount});
            this.pongCount = 0;
            this.socketLatency = 0;
        }
    }

    private shouldSplit(contents: IDocumentMessage[]): boolean {
        // Disabling message splitting - there is no compelling reason to use it.
        // Container.submitMessage should chunk messages properly.
        // Content can still be 2x size of maxMessageSize due to character escaping.
        const splitSize = this.maxMessageSize * 2;
        this.logger.debugAssert(
            !contents || contents.length <= splitSize,
            { eventName: "Splitting should not happen" });
        return false;
    }

    // Specific system level message attributes are need to be looked at by the server.
    // Hence they are separated and promoted as top level attributes.
    private createOutboundMessage(
        type: MessageType,
        coreMessage: IDocumentMessage): IDocumentMessage {
        if (isSystemType(type)) {
            const data = coreMessage.contents as string;
            coreMessage.contents = null;
            const outboundMessage: IDocumentSystemMessage = {
                ...coreMessage,
                data,
            };
            return outboundMessage;
        } else {
            return coreMessage;
        }
    }

    private connectCore(reason: string, delay: number, mode: ConnectionMode): void {
        if (this.connectRepeatCount === 0) {
            this.connectStartTime = performanceNow();
        }
        this.connectRepeatCount++;

        DeltaConnection.connect(
            this.service,
            this.client!,
            mode).then(
            (connection) => {
                this.connection = connection;
                // back-compat for newer clients and old server. If the server does not have mode, we reset to write.
                this.connectionMode = connection.details.mode ? connection.details.mode : "write";

                this._outbound.systemResume();

                this.clientSequenceNumber = 0;
                this.clientSequenceNumberObserved = 0;

                // If we retried more than once, log an event about how long it took
                if (this.connectRepeatCount > 2) {
                    this.logger.sendTelemetryEvent({
                            attempts: this.connectRepeatCount,
                            duration: (performanceNow() - this.connectStartTime).toFixed(0),
                            eventName: "MultipleDeltaConnectionFailures",
                        });
                }
                this.connectRepeatCount = 0;

                // If first connection resolve the promise with the details
                if (this.connecting) {
                    this.connecting.resolve(connection.details);
                    this.connecting = undefined;
                }

                connection.on("op", (documentId: string, messages: ISequencedDocumentMessage[]) => {
                    if (this.handler) {
                        if (messages instanceof Array) {
                            this.enqueueMessages(messages);
                        } else {
                            this.enqueueMessages([messages]);
                        }
                    }
                });

                connection.on("op-content", (message: IContentMessage) => {
                    if (this.handler) {
                        this.contentCache.set(message);
                    }
                });

                connection.on("signal", (message: ISignalMessage) => {
                    if (this.handler) {
                        this._inboundSignal.push(message);
                    }
                });

                // Always connect in write mode after getting nacked.
                connection.on("nack", (target: number) => {
                    const nackReason = target === -1 ? "Reconnecting to start writing" : "Reconnecting on nack";
                    this.reconnectOnError(nackReason, connection, "write");
                });

                //  Connection mode is always read on disconnect/error unless the system mode was write.
                connection.on("disconnect", (disconnectReason) => {
                    const reconnectionMode = this.systemConnectionMode === "write" ? "write" : "read";
                    this.reconnectOnError(
                        `Reconnecting on disconnect: ${disconnectReason}`,
                        connection,
                        reconnectionMode);
                });

                connection.on("error", (error) => {
                    // Observation based on early pre-production telemetry:
                    // We are getting transport errors from WebSocket here, right before or after "disconnect".
                    // This happens only in Firefox.
                    logNetworkFailure(this.logger, {eventName: "DeltaConnectionError"}, error);
                    const reconnectionMode = this.systemConnectionMode === "write" ? "write" : "read";
                    this.reconnectOnError("Reconnecting on error", connection, reconnectionMode);
                });

                connection.on("pong", (latency: number) => {
                    this.recordPingTime(latency);
                    this.emit("pong", latency);
                });

                // Notify of the connection
                // WARNING: This has to happen before processInitialMessages() call below.
                // If not, we may not update Container.pendingClientId in time before seeing our own join session op.
                this.emit("connect", connection.details);

                this.processInitialMessages(
                    connection.details.initialMessages,
                    connection.details.initialContents,
                    connection.details.initialSignals);

            },
            (error) => {
                // Socket.io error when we connect to wrong socket, or hit some multiplexing bug
                if (typeof error === "object" && error !== null && error.critical) {
                    this.emit("error", error);
                    if (this.connecting) {
                        this.connecting.reject(error);
                        this.connecting = undefined;
                    }
                    return;
                }

                // Log error once - we get too many errors in logs when we are offline,
                // and unfortunately there is no way to detect that.
                if (this.connectRepeatCount === 1) {
                    logNetworkFailure(
                        this.logger,
                        {
                            delay,
                            eventName: "DeltaConnectionFailureToConnect",
                        },
                        error);
                }

                const delayNext = Math.min(delay * 2, MaxReconnectDelay);
                waitForConnectedState(delayNext).then(() => this.connectCore(reason, delayNext, mode));
            });
    }

    private reconnectOnError(reason: string, connection: DeltaConnection, mode: ConnectionMode) {
        // we quite often get protocol errors before / after observing nack/disconnect
        // we do not want to run through same sequence twice.
        if (connection !== this.connection) {
            this.logger.sendTelemetryEvent({eventName: "DeltaConnectionReconnectIgnored", reason});
            return;
        }

        // avoid any re-entrancy - clear object reference
        this.connection = undefined;
        this.connectionMode = "read";

        this._outbound.systemPause();
        this._outbound.clear();
        this.emit("disconnect", reason);

        connection.close();

        // Reconnection is only enabled for browser clients.
        if (this.clientType !== Browser || !this.reconnect || this.closed) {
            this._inbound.systemPause();
            this._inbound.clear();
            this._inboundSignal.systemPause();
            this._inboundSignal.clear();
        } else {
            this.logger.sendTelemetryEvent({eventName: "DeltaConnectionReconnect", reason});
            this.connectCore(reason, InitialReconnectDelay, mode);
        }
    }

    private processInitialMessages(
            messages: ISequencedDocumentMessage[] | undefined,
            contents: IContentMessage[] | undefined,
            signals: ISignalMessage[] | undefined): void {
        // confirm the status of the handler and inbound queue
        if (!this.handler || this._inbound.paused) {
            // process them once the queue is ready
            this._inbound.once("resume", () => {
                this.enqueInitalOps(messages, contents);
            });
        } else {
            this.enqueInitalOps(messages, contents);
        }
        if (!this.handler || this._inboundSignal.paused) {
            // process them once the queue is ready
            this._inboundSignal.once("resume", () => {
                this.enqueInitalSignals(signals);
            });
        } else {
            this.enqueInitalSignals(signals);
        }
    }

    private enqueInitalOps(
            messages: ISequencedDocumentMessage[] | undefined,
            contents: IContentMessage[] | undefined): void {
        if (contents && contents.length > 0) {
            for (const content of contents) {
                this.contentCache.set(content);
            }
        }
        if (messages && messages.length > 0) {
            this.catchUp("enqueInitalOps", messages);
        }
    }

    private enqueInitalSignals(signals: ISignalMessage[] | undefined): void {
        if (signals && signals.length > 0) {
            for (const signal of signals) {
                this._inboundSignal.push(signal);
            }
        }
    }

    private async fetchOpContent(op: ISequencedDocumentMessage): Promise<IContentMessage> {
        let result: IContentMessage;
        const opContent = this.contentCache.peek(op.clientId);

        if (!opContent || opContent.clientSequenceNumber > op.clientSequenceNumber) {
            result = await this.waitForContent(op.clientId, op.clientSequenceNumber, op.sequenceNumber);
        } else if (opContent.clientSequenceNumber < op.clientSequenceNumber) {
            let nextContent = this.contentCache.get(op.clientId);
            while (nextContent && nextContent.clientSequenceNumber < op.clientSequenceNumber) {
                nextContent = this.contentCache.get(op.clientId);
            }

            assert(nextContent, "No content found");
            assert.equal(op.clientSequenceNumber, nextContent!.clientSequenceNumber, "Invalid op content order");

            result = nextContent!;
        } else {
            result = this.contentCache.get(op.clientId)!;
        }

        return result;
    }

    private enqueueMessages(messages: ISequencedDocumentMessage[]): void {
        assert(this.handler);
        for (const message of messages) {
            // Check that the messages are arriving in the expected order
            if (message.sequenceNumber !== this.lastQueuedSequenceNumber + 1) {
                debug(`DeltaManager: enque Messages *Out of* Order Message ${message.sequenceNumber} - last ${this.lastQueuedSequenceNumber}`);

                this.handleOutOfOrderMessage(message);
            } else {
                debug("DeltaManager: enque Messages In Order Message");
                this.lastQueuedSequenceNumber = message.sequenceNumber;
                this._inbound.push(message);
            }
        }
    }

    private processMessage(message: ISequencedDocumentMessage, callback: (err?: any) => void): void {
        const startTime = Date.now();

        if (this.connection && this.connection.details.clientId === message.clientId) {
            const clientSequenceNumber = message.clientSequenceNumber;

            this.logger.debugAssert(this.clientSequenceNumberObserved <= clientSequenceNumber);
            this.logger.debugAssert(clientSequenceNumber <= this.clientSequenceNumber);

            this.clientSequenceNumberObserved = clientSequenceNumber;
            if (clientSequenceNumber === this.clientSequenceNumber) {
                this.emit("allSentOpsAckd");
            }
        }

        // TODO Remove after SPO picks up the latest build.
        if (message.contents && typeof message.contents === "string" && message.type !== MessageType.ClientLeave) {
            message.contents = JSON.parse(message.contents);
        }

        // Add final ack trace.
        if (message.traces && message.traces.length > 0) {
            message.traces.push({
                action: "end",
                service: this.clientType,
                timestamp: Date.now(),
            });
        }

        // Watch the minimum sequence number and be ready to update as needed
        assert(this.minSequenceNumber <= message.minimumSequenceNumber);
        this.minSequenceNumber = message.minimumSequenceNumber;

        assert.equal(message.sequenceNumber, this.baseSequenceNumber + 1);
        this.baseSequenceNumber = message.sequenceNumber;

        // record collab window max size, in 20 increments.
        const msnDistance = this.baseSequenceNumber - this.minSequenceNumber;
        if (this.collabWindowMax + 20 < msnDistance) {
            this.collabWindowMax = msnDistance;
            this.logger.sendTelemetryEvent({ eventName: "MSNWindow", value: msnDistance });
        }

        this.handler!.process(
            message,
            (err?: any) => {
                if (err) {
                    callback(err);
                } else {
                    // We will queue a message to update our reference sequence number upon receiving a server
                    // operation. This allows the server to know our true reference sequence number and be able to
                    // correctly update the minimum sequence number (MSN). We don't acknowledge other message types
                    // similarly (like a min sequence number update) to avoid acknowledgement cycles (i.e. ack the MSN
                    // update, which updates the MSN, then ack the update, etc...).
                    if (message.type === MessageType.Operation ||
                      message.type === MessageType.Propose) {
                      this.updateSequenceNumber(message.type);
                    }

                    const endTime = Date.now();
                    this.emit("processTime", endTime - startTime);

                    callback();
                }
            });
    }

    /**
     * Handles an out of order message retrieved from the server
     */
    private handleOutOfOrderMessage(message: ISequencedDocumentMessage) {
        if (message.sequenceNumber <= this.lastQueuedSequenceNumber) {
            this.logger.sendTelemetryEvent({
                eventName: "DuplicateMessage",
                lastQueued: this.lastQueuedSequenceNumber!,
                sequenceNumber: message.sequenceNumber,
                totalDuplicateMessages: ++this.duplicateMsgCount,
            });
            return;
        }

        this.pending.push(message);
        this.fetchMissingDeltas("HandleOutOfOrderMessage", this.lastQueuedSequenceNumber, message.sequenceNumber);
    }

    /**
     * Retrieves the missing deltas between the given sequence numbers
     */
    private fetchMissingDeltas(reason: string, from: number, to?: number) {
        // Exit out early if we're already fetching deltas
        if (this.fetching) {
            this.logger.sendTelemetryEvent({eventName: "fetchMissingDeltasAlreadyFetching", from: from!, reason});
            return;
        }

        if (this.closed) {
            this.logger.sendTelemetryEvent({eventName: "fetchMissingDeltasClosedConnection" });
            return [];
        }

        this.fetching = true;

        this.getDeltas(reason, from, to).then(
            (messages) => {
                this.fetching = false;
                this.emit("caughtUp");
                this.catchUp(reason, messages);
            });
    }

    private async waitForContent(
            clientId: string,
            clientSeqNumber: number,
            seqNumber: number,
    ): Promise<IContentMessage> {
        const lateContentHandler = (clId: string) => {
            if (clientId === clId) {
                const lateContent = this.contentCache.peek(clId);
                if (lateContent && lateContent.clientSequenceNumber === clientSeqNumber) {
                    this.contentCache.removeListener("content", lateContentHandler);
                    debug(`Late content fetched from buffer ${clientId}: ${clientSeqNumber}`);
                    return this.contentCache.get(clientId);
                }
            }
        };

        this.contentCache.on("content", lateContentHandler);
        const content = await this.fetchContent(clientId, clientSeqNumber, seqNumber);
        this.contentCache.removeListener("content", lateContentHandler);

        return content;
    }

    private async fetchContent(
            clientId: string,
            clientSeqNumber: number,
            seqNumber: number): Promise<IContentMessage> {
        const messages = await this.getDeltas("fetchContent", seqNumber, seqNumber);
        assert.ok(messages.length > 0, "Content not found in DB");

        const message = messages[0];
        assert.equal(message.clientId, clientId, "Invalid fetched content");
        assert.equal(message.clientSequenceNumber, clientSeqNumber, "Invalid fetched content");

        debug(`Late content fetched from DB ${clientId}: ${clientSeqNumber}`);
        return {
            clientId: message.clientId,
            clientSequenceNumber: message.clientSequenceNumber,
            contents: message.contents,
        };
    }

    private catchUp(reason: string, messages: ISequencedDocumentMessage[]): void {
        this.logger.sendPerformanceEvent({
            eventName: "CatchUp",
            messageCount: messages.length,
            pendingCount: this.pending.length,
            reason,
        });

        // Apply current operations
        this.enqueueMessages(messages);

        // Then sort pending operations and attempt to apply them again.
        // This could be optimized to stop handling messages once we realize we need to fetch missing values.
        // But for simplicity, and because catching up should be rare, we just process all of them.
        const pendingSorted = this.pending.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        this.pending = [];
        this.enqueueMessages(pendingSorted);
    }

    /**
     * Acks the server to update the reference sequence number
     */
    private updateSequenceNumber(type: MessageType): void {
        // Exit early for inactive clients. They don't take part in the minimum sequence number calculation.
        if (!this.active) {
            return;
        }

        // On a quorum proposal, immediately send a response to expedite the approval.
        if (type === MessageType.Propose) {
            this.submit(MessageType.NoOp, ImmediateNoOpResponse);
            return;
        }

        // If an update has already been requested then mark this fact. We will wait until no updates have
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
                this.submit(MessageType.NoOp, null);
            } else {
                this.updateHasBeenRequested = false;
                this.updateSequenceNumber(type);
            }
        }, 100);
    }

    private stopSequenceNumberUpdate(): void {
        if (this.updateSequenceNumberTimer) {
            clearTimeout(this.updateSequenceNumberTimer);
        }

        this.updateHasBeenRequested = false;
        this.updateSequenceNumberTimer = undefined;
    }
}
