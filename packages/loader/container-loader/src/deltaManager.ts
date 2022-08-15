/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { default as AbortController } from "abort-controller";
import { v4 as uuid } from "uuid";
import {
    ITelemetryLogger,
    IEventProvider,
    ITelemetryProperties,
    ITelemetryErrorEvent,
} from "@fluidframework/common-definitions";
import {
    IDeltaHandlerStrategy,
    IDeltaManager,
    IDeltaManagerEvents,
    IDeltaQueue,
    ICriticalContainerError,
    IThrottlingWarning,
    IConnectionDetails,
} from "@fluidframework/container-definitions";
import { assert, TypedEventEmitter } from "@fluidframework/common-utils";
import {
    normalizeError,
    logIfFalse,
    safeRaiseEvent,
} from "@fluidframework/telemetry-utils";
import {
    IDocumentDeltaStorageService,
    IDocumentService,
    DriverErrorType,
} from "@fluidframework/driver-definitions";
import {
    IDocumentMessage,
    ISequencedDocumentMessage,
    ISignalMessage,
    MessageType,
    ConnectionMode,
} from "@fluidframework/protocol-definitions";
import {
    NonRetryableError,
    isClientMessage,
} from "@fluidframework/driver-utils";
import {
    ThrottlingWarning,
    DataCorruptionError,
    extractSafePropertiesFromMessage,
    DataProcessingError,
} from "@fluidframework/container-utils";
import { DeltaQueue } from "./deltaQueue";
import {
    IConnectionManagerFactoryArgs,
    IConnectionManager,
 } from "./contracts";

export interface IConnectionArgs {
    mode?: ConnectionMode;
    fetchOpsFromStorage?: boolean;
    reason: string;
}

/**
 * Includes events emitted by the concrete implementation DeltaManager
 * but not exposed on the public interface IDeltaManager
 */
export interface IDeltaManagerInternalEvents extends IDeltaManagerEvents {
    (event: "throttled", listener: (error: IThrottlingWarning) => void);
    (event: "closed", listener: (error?: ICriticalContainerError) => void);
}

/**
 * Manages the flow of both inbound and outbound messages. This class ensures that shared objects receive delta
 * messages in order regardless of possible network conditions or timings causing out of order delivery.
 */
export class DeltaManager<TConnectionManager extends IConnectionManager>
    extends TypedEventEmitter<IDeltaManagerInternalEvents>
    implements
    IDeltaManager<ISequencedDocumentMessage, IDocumentMessage>,
    IEventProvider<IDeltaManagerInternalEvents> {
    public readonly connectionManager: TConnectionManager;

    public get active(): boolean { return this._active(); }

    public get disposed() { return this.closed; }

    public get IDeltaSender() { return this; }

    private pending: ISequencedDocumentMessage[] = [];
    private fetchReason: string | undefined;

    // The minimum sequence number and last sequence number received from the server
    private minSequenceNumber: number = 0;

    // There are three numbers we track
    // * lastQueuedSequenceNumber is the last queued sequence number. If there are gaps in seq numbers, then this number
    //   is not updated until we cover that gap, so it increases each time by 1.
    // * lastObservedSeqNumber is  an estimation of last known sequence number for container in storage. It's initially
    //   populated at web socket connection time (if storage provides that info) and is  updated once ops shows up.
    //   It's never less than lastQueuedSequenceNumber
    // * lastProcessedSequenceNumber - last processed sequence number
    private lastQueuedSequenceNumber: number = 0;
    private lastObservedSeqNumber: number = 0;
    private lastProcessedSequenceNumber: number = 0;
    private lastProcessedMessage: ISequencedDocumentMessage | undefined;
    private baseTerm: number = 0;

    /**
     * Track down the ops size.
    */
    private opsSize: number = 0;
    private prevEnqueueMessagesReason: string | undefined;
    private previouslyProcessedMessage: ISequencedDocumentMessage | undefined;

    // The sequence number we initially loaded from
    // In case of reading from a snapshot or pending state, its value will be equal to
    // the last message that got serialized.
    private initSequenceNumber: number = 0;

    private readonly _inbound: DeltaQueue<ISequencedDocumentMessage>;
    private readonly _inboundSignal: DeltaQueue<ISignalMessage>;

    private closed = false;

    private handler: IDeltaHandlerStrategy | undefined;
    private deltaStorage: IDocumentDeltaStorageService | undefined;

    private readonly throttlingIdSet = new Set<string>();
    private timeTillThrottling: number = 0;

    public readonly closeAbortController = new AbortController();

    private readonly deltaStorageDelayId = uuid();
    private readonly deltaStreamDelayId = uuid();

    private messageBuffer: IDocumentMessage[] = [];

    private _checkpointSequenceNumber: number | undefined;

    public get inbound(): IDeltaQueue<ISequencedDocumentMessage> {
        return this._inbound;
    }

    public get inboundSignal(): IDeltaQueue<ISignalMessage> {
        return this._inboundSignal;
    }

    public get initialSequenceNumber(): number {
        return this.initSequenceNumber;
    }

    public get lastSequenceNumber(): number {
        return this.lastProcessedSequenceNumber;
    }

    public get lastMessage() {
        return this.lastProcessedMessage;
    }

    public get lastKnownSeqNumber() {
        return this.lastObservedSeqNumber;
    }

    public get referenceTerm(): number {
        return this.baseTerm;
    }

    public get minimumSequenceNumber(): number {
        return this.minSequenceNumber;
    }

    /**
     * Tells if  current connection has checkpoint information.
     * I.e. we know how far behind the client was at the time of establishing connection
     */
     public get hasCheckpointSequenceNumber() {
        // Valid to be called only if we have active connection.
        assert(this.connectionManager.connected, 0x0df /* "Missing active connection" */);
        return this._checkpointSequenceNumber !== undefined;
    }

    // Forwarding connection manager properties / IDeltaManager implementation
    public get maxMessageSize(): number { return this.connectionManager.maxMessageSize; }
    public get version() { return this.connectionManager.version; }
    public get serviceConfiguration() { return this.connectionManager.serviceConfiguration; }
    public get outbound() { return this.connectionManager.outbound; }
    public get readOnlyInfo() { return this.connectionManager.readOnlyInfo; }
    public get clientDetails() { return this.connectionManager.clientDetails; }

    public submit(type: MessageType, contents: any, batch = false, metadata?: any) {
        const messagePartial: Omit<IDocumentMessage, "clientSequenceNumber"> = {
            contents: JSON.stringify(contents),
            metadata,
            referenceSequenceNumber: this.lastProcessedSequenceNumber,
            type,
        };

        if (!batch) {
            this.flush();
        }

        const message = this.connectionManager.prepareMessageToSend(messagePartial);
        if (message === undefined) {
            return -1;
        }

        this.opsSize += message.contents.length;

        this.messageBuffer.push(message);

        this.emit("submitOp", message);

        if (!batch) {
            this.flush();
        }

        return message.clientSequenceNumber;
    }

    public submitSignal(content: any) { return this.connectionManager.submitSignal(content); }

    public flush() {
        if (this.messageBuffer.length === 0) {
            return;
        }

        // The prepareFlush event allows listeners to append metadata to the batch prior to submission.
        this.emit("prepareSend", this.messageBuffer);

        this.connectionManager.sendMessages(this.messageBuffer);
        this.messageBuffer = [];
    }

    public get connectionProps(): ITelemetryProperties {
        return {
            sequenceNumber: this.lastSequenceNumber,
            opsSize: this.opsSize > 0 ? this.opsSize : undefined,
            ...this.connectionManager.connectionProps,
        };
    }

    /**
     * Log error event with a bunch of internal to DeltaManager information about state of op processing
     * Used to diagnose connectivity issues related to op processing (i.e. cases where for some reason
     * we stop processing ops that results in no processing join op and thus moving to connected state)
     * @param event - Event to log.
     */
    public logConnectionIssue(event: ITelemetryErrorEvent) {
        assert(this.connectionManager.connected, 0x238 /* "called only in connected state" */);

        const pendingSorted = this.pending.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        this.logger.sendErrorEvent({
            ...event,
            // This directly tells us if fetching ops is in flight, and thus likely the reason of
            // stalled op processing
            fetchReason: this.fetchReason,
            // A bunch of useful sequence numbers to understand if we are holding some ops from processing
            lastQueuedSequenceNumber: this.lastQueuedSequenceNumber, // last sequential op
            lastProcessedSequenceNumber: this.lastProcessedSequenceNumber, // same as above, but after processing
            lastObserved: this.lastObservedSeqNumber, // last sequence we ever saw; may have gaps with above.
            // connection info
            ...this.connectionManager.connectionVerboseProps,
            pendingOps: this.pending.length, // Do we have any pending ops?
            pendingFirst: pendingSorted[0]?.sequenceNumber, // is the first pending op the one that we are missing?
            haveHandler: this.handler !== undefined, // do we have handler installed?
            inboundLength: this.inbound.length,
            inboundPaused: this.inbound.paused,
        });
    }

    constructor(
        private readonly serviceProvider: () => IDocumentService | undefined,
        private readonly logger: ITelemetryLogger,
        private readonly _active: () => boolean,
        createConnectionManager: (props: IConnectionManagerFactoryArgs) => TConnectionManager,
    ) {
        super();
        const props: IConnectionManagerFactoryArgs = {
            incomingOpHandler: (messages: ISequencedDocumentMessage[], reason: string) => {
                try {
                    this.enqueueMessages(messages, reason);
                } catch (error) {
                    this.logger.sendErrorEvent({ eventName: "EnqueueMessages_Exception" }, error);
                    this.close(normalizeError(error));
                }
            },
            signalHandler: (message: ISignalMessage) => this._inboundSignal.push(message),
            reconnectionDelayHandler: (delayMs: number, error: unknown) =>
                this.emitDelayInfo(this.deltaStreamDelayId, delayMs, error),
            closeHandler: (error: any) => this.close(error),
            disconnectHandler: (reason: string) => this.disconnectHandler(reason),
            connectHandler: (connection: IConnectionDetails) => this.connectHandler(connection),
            pongHandler: (latency: number) => this.emit("pong", latency),
            readonlyChangeHandler: (readonly?: boolean) => safeRaiseEvent(this, this.logger, "readonly", readonly),
        };

        this.connectionManager = createConnectionManager(props);

        this._inbound = new DeltaQueue<ISequencedDocumentMessage>(
            (op) => {
                this.processInboundMessage(op);
            });

        this._inbound.on("error", (error) => {
            this.close(
                DataProcessingError.wrapIfUnrecognized(error, "deltaManagerInboundErrorHandler", this.lastMessage));
        });

        // Inbound signal queue
        this._inboundSignal = new DeltaQueue<ISignalMessage>((message) => {
            if (this.handler === undefined) {
                throw new Error("Attempted to process an inbound signal without a handler attached");
            }
            this.handler.processSignal({
                clientId: message.clientId,
                content: JSON.parse(message.content as string),
            });
        });

        this._inboundSignal.on("error", (error) => {
            this.close(normalizeError(error));
        });

        // Initially, all queues are created paused.
        // - outbound is flipped back and forth in setupNewSuccessfulConnection / disconnectFromDeltaStream
        // - inbound & inboundSignal are resumed in attachOpHandler() when we have handler setup
    }

    private connectHandler(connection: IConnectionDetails) {
        this.refreshDelayInfo(this.deltaStreamDelayId);

        const props = this.connectionManager.connectionVerboseProps;
        props.connectionLastQueuedSequenceNumber = this.lastQueuedSequenceNumber;
        props.connectionLastObservedSeqNumber = this.lastObservedSeqNumber;

        const checkpointSequenceNumber = connection.checkpointSequenceNumber;
        this._checkpointSequenceNumber = checkpointSequenceNumber;
        if (checkpointSequenceNumber !== undefined) {
            this.updateLatestKnownOpSeqNumber(checkpointSequenceNumber);
        }

        // We cancel all ops on lost of connectivity, and rely on DDSes to resubmit them.
        // Semantics are not well defined for batches (and they are broken right now on disconnects anyway),
        // but it's safe to assume (until better design is put into place) that batches should not exist
        // across multiple connections. Right now we assume runtime will not submit any ops in disconnected
        // state. As requirements change, so should these checks.
        assert(this.messageBuffer.length === 0, 0x0e9 /* "messageBuffer is not empty on new connection" */);

        this.opsSize = 0;

        this.emit(
            "connect",
            connection,
            checkpointSequenceNumber !== undefined ?
                this.lastObservedSeqNumber - this.lastSequenceNumber : undefined);

        // If we got some initial ops, then we know the gap and call above fetched ops to fill it.
        // Same is true for "write" mode even if we have no ops - we will get "join" own op very very soon.
        // However if we are connecting as view-only, then there is no good signal to realize if client is behind.
        // Thus we have to hit storage to see if any ops are there.
        if (checkpointSequenceNumber !== undefined) {
            // We know how far we are behind (roughly). If it's non-zero gap, fetch ops right away.
            if (checkpointSequenceNumber > this.lastQueuedSequenceNumber) {
                this.fetchMissingDeltas("AfterConnection");
            }
        // we do not know the gap, and we will not learn about it if socket is quite - have to ask.
        } else if (connection.mode === "read") {
            this.fetchMissingDeltas("AfterReadConnection");
        }
    }

    public dispose() {
        throw new Error("Not implemented.");
    }

    /**
     * Sets the sequence number from which inbound messages should be returned
     */
    public async attachOpHandler(
        minSequenceNumber: number,
        sequenceNumber: number,
        term: number,
        handler: IDeltaHandlerStrategy,
        prefetchType: "cached" | "all" | "none" = "none",
    ) {
        this.initSequenceNumber = sequenceNumber;
        this.lastProcessedSequenceNumber = sequenceNumber;
        this.baseTerm = term;
        this.minSequenceNumber = minSequenceNumber;
        this.lastQueuedSequenceNumber = sequenceNumber;
        this.lastObservedSeqNumber = sequenceNumber;

        // We will use same check in other places to make sure all the seq number above are set properly.
        assert(this.handler === undefined, 0x0e2 /* "DeltaManager already has attached op handler!" */);
        this.handler = handler;
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        assert(!!(this.handler as any), 0x0e3 /* "Newly set op handler is null/undefined!" */);

        // There should be no pending fetch!
        // This API is called right after attachOpHandler by Container.load().
        // We might have connection already and it might have called fetchMissingDeltas() from
        // setupNewSuccessfulConnection. But it should do nothing, because there is no way to fetch ops before
        // we know snapshot sequence number that is set in attachOpHandler. So all such calls should be noop.
        assert(this.fetchReason === undefined, 0x268 /* "There can't be pending fetch that early in boot sequence!" */);

        if (this.closed) {
            return;
        }

        this._inbound.resume();
        this._inboundSignal.resume();

        if (prefetchType !== "none") {
            const cacheOnly = prefetchType === "cached";
            await this.fetchMissingDeltasCore(`DocumentOpen_${prefetchType}`, cacheOnly);

            // Keep going with fetching ops from storage once we have all cached ops in.
            // But do not block load and make this request async / not blocking this api.
            // Ops processing will start once cached ops are in and and will stop when queue is empty
            // (which in most cases will happen when we are done processing cached ops)
            if (cacheOnly) {
                // fire and forget
                this.fetchMissingDeltas("PostDocumentOpen");
            }
        }

        // Ensure there is no need to call this.processPendingOps() at the end of boot sequence
        assert(this.fetchReason !== undefined || this.pending.length === 0, 0x269 /* "pending ops are not dropped" */);
    }

    public connect(args: IConnectionArgs) {
        const fetchOpsFromStorage = args.fetchOpsFromStorage ?? true;
        logIfFalse(
            this.handler !== undefined || !fetchOpsFromStorage,
            this.logger,
            "CantFetchWithoutBaseline"); // can't fetch if no baseline

        // Note: There is race condition here.
        // We want to issue request to storage as soon as possible, to
        // reduce latency of becoming current, thus this code here.
        // But there is no ordering between fetching OPs and connection to delta stream
        // As result, we might be behind by the time we connect to delta stream
        // In case of r/w connection, that's not an issue, because we will hear our
        // own "join" message and realize any gap client has in ops.
        // But for view-only connection, we have no such signal, and with no traffic
        // on the wire, we might be always behind.
        // See comment at the end of "connect" handler
        if (fetchOpsFromStorage) {
            this.fetchMissingDeltas(args.reason);
        }

        this.connectionManager.connect(args.mode);
    }

    private async getDeltas(
        from: number, // inclusive
        to: number | undefined, // exclusive
        fetchReason: string,
        callback: (messages: ISequencedDocumentMessage[]) => void,
        cacheOnly: boolean) {
        const docService = this.serviceProvider();
        if (docService === undefined) {
            throw new Error("Delta manager is not attached");
        }

        if (this.deltaStorage === undefined) {
            this.deltaStorage = await docService.connectToDeltaStorage();
        }

        let cancelFetch: (op: ISequencedDocumentMessage) => boolean;

        if (to !== undefined) {
            const lastExpectedOp = to - 1; // make it inclusive!

            // It is possible that due to asynchrony (including await above), required ops were already
            // received through delta stream. Validate that before moving forward.
            if (this.lastQueuedSequenceNumber >= lastExpectedOp) {
                this.logger.sendPerformanceEvent({
                    reason: fetchReason,
                    eventName: "ExtraStorageCall",
                    early: true,
                    from,
                    to,
                    ...this.connectionManager.connectionVerboseProps,
                });
                return;
            }

            // Be prepared for the case where webSocket would receive the ops that we are trying to fill through
            // storage. Ideally it should never happen (i.e. ops on socket are always ordered, and thus once we
            // detected gap, this gap can't be filled in later on through websocket).
            // And in practice that does look like the case. The place where this code gets hit is if we lost
            // connection and reconnected (likely to another box), and new socket's initial ops contains these ops.
            cancelFetch = (op: ISequencedDocumentMessage) => op.sequenceNumber >= lastExpectedOp;
        } else {
            // Unbound requests are made to proactively fetch ops, but also get up to date in cases where socket
            // is silent (and connection is "read", thus we might not have any data on how far client is behind).
            // Once we have any op coming in from socket, we can cancel it as it's not needed any more.
            // That said, if we have socket connection, make sure we got ops up to checkpointSequenceNumber!
            cancelFetch = (op: ISequencedDocumentMessage) => op.sequenceNumber >= this.lastObservedSeqNumber;
        }

        const controller = new AbortController();
        let opsFromFetch = false;

        const opListener = (op: ISequencedDocumentMessage) => {
            assert(op.sequenceNumber === this.lastQueuedSequenceNumber, 0x23a /* "seq#'s" */);
            // Ops that are coming from this request should not cancel itself.
            // This is useless for known ranges (to is defined) as it means request is over either way.
            // And it will cancel unbound request too early, not allowing us to learn where the end of the file is.
            if (!opsFromFetch && cancelFetch(op)) {
                controller.abort();
                this._inbound.off("push", opListener);
            }
        };

        try {
            this._inbound.on("push", opListener);
            assert(this.closeAbortController.signal.onabort === null, 0x1e8 /* "reentrancy" */);
            this.closeAbortController.signal.onabort = () => controller.abort();

            const stream = this.deltaStorage.fetchMessages(
                from, // inclusive
                to, // exclusive
                controller.signal,
                cacheOnly,
                fetchReason);

            // eslint-disable-next-line no-constant-condition
            while (true) {
                const result = await stream.read();
                if (result.done) {
                    break;
                }
                try {
                    opsFromFetch = true;
                    callback(result.value);
                } finally {
                    opsFromFetch = false;
                }
            }
        } finally {
            this.closeAbortController.signal.onabort = null;
            this._inbound.off("push", opListener);
            assert(!opsFromFetch, 0x289 /* "logic error" */);
        }
    }

    /**
     * Closes the connection and clears inbound & outbound queues.
     */
    public close(error?: ICriticalContainerError): void {
        if (this.closed) {
            return;
        }
        this.closed = true;

        this.connectionManager.dispose(error);

        this.closeAbortController.abort();

        this._inbound.clear();
        this._inboundSignal.clear();

        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this._inbound.pause();
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this._inboundSignal.pause();

        // Drop pending messages - this will ensure catchUp() does not go into infinite loop
        this.pending = [];

        // This needs to be the last thing we do (before removing listeners), as it causes
        // Container to dispose context and break ability of data stores / runtime to "hear"
        // from delta manager, including notification (above) about readonly state.
        this.emit("closed", error);

        this.removeAllListeners();
    }

    public refreshDelayInfo(id: string) {
        this.throttlingIdSet.delete(id);
        if (this.throttlingIdSet.size === 0) {
            this.timeTillThrottling = 0;
        }
    }

    private disconnectHandler(reason: string) {
        this.messageBuffer.length = 0;
        this.emit("disconnect", reason);
    }

    /**
     * Emit info about a delay in service communication on account of throttling.
     * @param id - Id of the connection that is delayed
     * @param delayMs - Duration of the delay
     * @param error - error object indicating the throttling
     */
    public emitDelayInfo(id: string, delayMs: number, error: unknown) {
        const timeNow = Date.now();
        this.throttlingIdSet.add(id);
        if (delayMs > 0 && (timeNow + delayMs > this.timeTillThrottling)) {
            this.timeTillThrottling = timeNow + delayMs;

            const throttlingWarning: IThrottlingWarning = ThrottlingWarning.wrap(
                error,
                delayMs / 1000 /* retryAfterSeconds */,
                this.logger,
            );
            this.emit("throttled", throttlingWarning);
        }
    }

    // returns parts of message (in string format) that should never change for a given message.
    // Used for message comparison. It attempts to avoid comparing fields that potentially may differ.
    // for example, it's not clear if serverMetadata or timestamp property is a property of message or server state.
    // We only extract the most obvious fields that are sufficient (with high probability) to detect sequence number
    // reuse.
    // Also payload goes to telemetry, so no PII, including content!!
    // Note: It's possible for a duplicate op to be broadcasted and have everything the same except the timestamp.
    private comparableMessagePayload(m: ISequencedDocumentMessage) {
        return `${m.clientId}-${m.type}-${m.minimumSequenceNumber}-${m.referenceSequenceNumber}-${m.timestamp}`;
    }

    private enqueueMessages(
        messages: ISequencedDocumentMessage[],
        reason: string,
        allowGaps = false,
    ): void {
        if (this.handler === undefined) {
            // We did not setup handler yet.
            // This happens when we connect to web socket faster than we get attributes for container
            // and thus faster than attachOpHandler() is called
            // this.lastProcessedSequenceNumber is still zero, so we can't rely on this.fetchMissingDeltas()
            // to do the right thing.
            this.pending = this.pending.concat(messages);
            return;
        }

        // Pending ops should never just hang around for nothing.
        // This invariant will stay true through this function execution,
        // so there is no need to process pending ops here.
        // It's responsibility of
        // - attachOpHandler()
        // - fetchMissingDeltas() after it's done with querying storage
        assert(this.pending.length === 0 || this.fetchReason !== undefined, 0x1e9 /* "Pending ops" */);

        if (messages.length === 0) {
            return;
        }

        const from = messages[0].sequenceNumber;
        const last = messages[messages.length - 1].sequenceNumber;

        // Report stats about missing and duplicate ops
        // This helps better understand why we fetch ops from storage, and thus may delay
        // getting current / sending ops
        // It's possible that this batch is already too late - do not bother
        if (last > this.lastQueuedSequenceNumber) {
            let prev = from - 1;
            const initialGap = prev - this.lastQueuedSequenceNumber;
            let firstMissing: number | undefined;
            let duplicate = 0;
            let gap = 0;

            // Count all gaps and duplicates
            for (const message of messages) {
                if (message.sequenceNumber === prev) {
                    duplicate++;
                } else if (message.sequenceNumber !== prev + 1) {
                    gap++;
                    if (firstMissing === undefined) {
                        firstMissing = prev + 1;
                    }
                }
                prev = message.sequenceNumber;
            }

            let eventName: string | undefined;

            // Report if we found some issues
            if (duplicate !== 0 || gap !== 0 && !allowGaps || initialGap > 0 && this.fetchReason === undefined) {
                eventName = "enqueueMessages";
            // Also report if we are fetching ops, and same range comes in, thus making this fetch obsolete.
            } else if (this.fetchReason !== undefined && this.fetchReason !== reason &&
                    (from <= this.lastQueuedSequenceNumber + 1 && last > this.lastQueuedSequenceNumber)) {
                eventName = "enqueueMessagesExtraFetch";
            }

            // Report if there is something to report
            // Do not report when pending fetch is in progress, as such reporting will not
            // correctly take into account pending ops.
            if (eventName !== undefined) {
                this.logger.sendPerformanceEvent({
                    eventName,
                    reason,
                    previousReason: this.prevEnqueueMessagesReason,
                    from,
                    to: last + 1, // exclusive, being consistent with the other telemetry / APIs
                    length: messages.length,
                    fetchReason: this.fetchReason,
                    duplicate: duplicate > 0 ? duplicate : undefined,
                    initialGap: initialGap !== 0 ? initialGap : undefined,
                    gap: gap > 0 ? gap : undefined,
                    firstMissing,
                    dmInitialSeqNumber: this.initialSequenceNumber,
                    ...this.connectionManager.connectionVerboseProps,
                });
            }
        }

        this.updateLatestKnownOpSeqNumber(messages[messages.length - 1].sequenceNumber);

        const n = this.previouslyProcessedMessage?.sequenceNumber;
        assert(n === undefined || n === this.lastQueuedSequenceNumber,
            0x0ec /* "Unexpected value for previously processed message's sequence number" */);

        for (const message of messages) {
            // Check that the messages are arriving in the expected order
            if (message.sequenceNumber <= this.lastQueuedSequenceNumber) {
                // Validate that we do not have data loss, i.e. sequencing is reset and started again
                // with numbers that this client already observed before.
                if (this.previouslyProcessedMessage?.sequenceNumber === message.sequenceNumber) {
                    const message1 = this.comparableMessagePayload(this.previouslyProcessedMessage);
                    const message2 = this.comparableMessagePayload(message);
                    if (message1 !== message2) {
                        const error = new NonRetryableError(
                            // This looks like a data corruption but the culprit was that the file was overwritten
                            // in storage.  See PR #5882.
                            // Likely to be an issue with Fluid Services. Content does not match previous client
                            // knowledge about this file. If the file is overwritten for any reason, this error can be
                            // hit. One example is that some clients could be submitting ops to two different service
                            // instances such that the same sequence number is reused for two different ops.
                            // pre-0.58 error message: twoMessagesWithSameSeqNumAndDifferentPayload
                            "Found two messages with the same sequenceNumber but different payloads. Likely to be a "
                            + "service issue",
                            DriverErrorType.fileOverwrittenInStorage,
                            {
                                clientId: this.connectionManager.clientId,
                                sequenceNumber: message.sequenceNumber,
                                message1,
                                message2,
                                driverVersion: undefined,
                            },
                        );
                        this.close(error);
                    }
                }
            } else if (message.sequenceNumber !== this.lastQueuedSequenceNumber + 1) {
                this.pending.push(message);
                this.fetchMissingDeltas(reason, message.sequenceNumber);
            } else {
                this.lastQueuedSequenceNumber = message.sequenceNumber;
                this.previouslyProcessedMessage = message;
                this._inbound.push(message);
            }
        }

        // When / if we report a gap in ops in the future, we want telemetry to correctly reflect source
        // of prior ops. But if we have some out of order ops (this.pending), then reporting current reason
        // becomes not accurate, as the gap existed before current batch, so we should just report "unknown".
        this.prevEnqueueMessagesReason = this.pending.length > 0 ? "unknown" : reason;
    }

    private processInboundMessage(message: ISequencedDocumentMessage): void {
        const startTime = Date.now();
        this.lastProcessedMessage = message;

        // All non-system messages are coming from some client, and should have clientId
        // System messages may have no clientId (but some do, like propose, noop, summarize)
        assert(
            message.clientId !== undefined
            || !(isClientMessage(message)),
            0x0ed /* "non-system message have to have clientId" */,
        );

        // TODO Remove after SPO picks up the latest build.
        if (
            typeof message.contents === "string"
            && message.contents !== ""
            && message.type !== MessageType.ClientLeave
        ) {
            message.contents = JSON.parse(message.contents);
        }

        this.connectionManager.beforeProcessingIncomingOp(message);

        // Watch the minimum sequence number and be ready to update as needed
        if (this.minSequenceNumber > message.minimumSequenceNumber) {
            // pre-0.58 error message: msnMovesBackwards
            throw new DataCorruptionError("Found a lower minimumSequenceNumber (msn) than previously recorded", {
                ...extractSafePropertiesFromMessage(message),
                clientId: this.connectionManager.clientId,
            });
        }
        this.minSequenceNumber = message.minimumSequenceNumber;

        if (message.sequenceNumber !== this.lastProcessedSequenceNumber + 1) {
            // pre-0.58 error message: nonSequentialSequenceNumber
            throw new DataCorruptionError("Found a non-Sequential sequenceNumber", {
                ...extractSafePropertiesFromMessage(message),
                clientId: this.connectionManager.clientId,
            });
        }
        this.lastProcessedSequenceNumber = message.sequenceNumber;

        // a bunch of code assumes that this is true
        assert(this.lastProcessedSequenceNumber <= this.lastObservedSeqNumber,
            0x267 /* "lastObservedSeqNumber should be updated first" */);

        // Back-compat for older server with no term
        if (message.term === undefined) {
            message.term = 1;
        }
        this.baseTerm = message.term;

        if (this.handler === undefined) {
            throw new Error("Attempted to process an inbound message without a handler attached");
        }
        this.handler.process(message);

        const endTime = Date.now();

        // Should be last, after changing this.lastProcessedSequenceNumber above, as many callers
        // test this.lastProcessedSequenceNumber instead of using op.sequenceNumber itself.
        this.emit("op", message, endTime - startTime);
    }

    /**
     * Retrieves the missing deltas between the given sequence numbers
     */
     private fetchMissingDeltas(reasonArg: string, to?: number) {
         this.fetchMissingDeltasCore(reasonArg, false /* cacheOnly */, to).catch((error) => {
             this.logger.sendErrorEvent({ eventName: "fetchMissingDeltasException" }, error);
         });
     }

     /**
     * Retrieves the missing deltas between the given sequence numbers
     */
    private async fetchMissingDeltasCore(
        reason: string,
        cacheOnly: boolean,
        to?: number) {
        // Exit out early if we're already fetching deltas
        if (this.fetchReason !== undefined) {
            return;
        }

        if (this.closed) {
            this.logger.sendTelemetryEvent({ eventName: "fetchMissingDeltasClosedConnection", reason });
            return;
        }

        if (this.handler === undefined) {
            // We do not poses yet any information
            assert(this.lastQueuedSequenceNumber === 0, 0x26b /* "initial state" */);
            return;
        }

        try {
            let from = this.lastQueuedSequenceNumber + 1;

            const n = this.previouslyProcessedMessage?.sequenceNumber;
            if (n !== undefined) {
                // If we already processed at least one op, then we have this.previouslyProcessedMessage populated
                // and can use it to validate that we are operating on same file, i.e. it was not overwritten.
                // Knowing about this mechanism, we could ask for op we already observed to increase validation.
                // This is especially useful when coming out of offline mode or loading from
                // very old cached (by client / driver) snapshot.
                assert(n === this.lastQueuedSequenceNumber, 0x0f2 /* "previouslyProcessedMessage" */);
                assert(from > 1, 0x0f3 /* "not positive" */);
                from--;
            }

            const fetchReason = `${reason}_fetch`;
            this.fetchReason = fetchReason;

            await this.getDeltas(
                from,
                to,
                fetchReason,
                (messages) => {
                    this.refreshDelayInfo(this.deltaStorageDelayId);
                    this.enqueueMessages(messages, fetchReason);
                },
                cacheOnly);
        } catch (error) {
            this.logger.sendErrorEvent({ eventName: "GetDeltas_Exception" }, error);
            this.close(normalizeError(error));
        } finally {
            this.refreshDelayInfo(this.deltaStorageDelayId);
            this.fetchReason = undefined;
            this.processPendingOps(reason);
        }
    }

    /**
     * Sorts pending ops and attempts to apply them
     */
    private processPendingOps(reason?: string): void {
        if (this.closed) {
            return;
        }

        assert(this.handler !== undefined, 0x26c /* "handler should be installed" */);

        const pendingSorted = this.pending.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
        this.pending = [];
        // Given that we do not track where these ops came from any more, it's not very
        // actionably to report gaps in this range.
        this.enqueueMessages(pendingSorted, `${reason}_pending`, true /* allowGaps */);

        // Re-entrancy is ignored by fetchMissingDeltas, execution will come here when it's over
        if (this.fetchReason === undefined) {
            // See issue #7312 for more details
            // We observe cases where client gets into situation where it is not aware of missing ops
            // (i.e. client being behind), and as such, does not attempt to fetch them.
            // In some cases client may not have enough signal (example - "read" connection that is silent -
            // there is no easy way for client to realize it's behind, see a bit of commentary / logic at the
            // end of setupNewSuccessfulConnection). In other cases it should be able to learn that info ("write"
            // connection, learn by receiving its own join op), but data suggest it does not happen.
            // In 50% of these cases we do know we are behind through checkpointSequenceNumber on connection object
            // and thus can leverage that to trigger recovery. But this is not going to solve all the problems
            // (the other 50%), and thus these errors below should be looked at even if code below results in
            // recovery.
            if (this.lastQueuedSequenceNumber < this.lastObservedSeqNumber) {
                this.fetchMissingDeltas("OpsBehind");
            }
        }
    }

    private updateLatestKnownOpSeqNumber(seq: number) {
        if (this.lastObservedSeqNumber < seq) {
            this.lastObservedSeqNumber = seq;
        }
    }
}
