/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICriticalContainerError } from "@fluidframework/container-definitions";
import {
	IDeltaManagerEvents,
	IDeltaManagerFull,
	IDeltaQueue,
	type IDeltaSender,
	type ReadOnlyInfo,
} from "@fluidframework/container-definitions/internal";
import {
	IEventProvider,
	type ITelemetryBaseEvent,
	ITelemetryBaseProperties,
} from "@fluidframework/core-interfaces";
import { IThrottlingWarning } from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { ConnectionMode } from "@fluidframework/driver-definitions";
import {
	IDocumentDeltaStorageService,
	IDocumentService,
	DriverErrorTypes,
	IDocumentMessage,
	MessageType,
	ISequencedDocumentMessage,
	ISignalMessage,
	type IClientDetails,
	type IClientConfiguration,
} from "@fluidframework/driver-definitions/internal";
import { NonRetryableError, isRuntimeMessage } from "@fluidframework/driver-utils/internal";
import {
	type ITelemetryErrorEventExt,
	type ITelemetryGenericEventExt,
	ITelemetryLoggerExt,
	DataCorruptionError,
	DataProcessingError,
	UsageError,
	extractSafePropertiesFromMessage,
	isFluidError,
	normalizeError,
	safeRaiseEvent,
	EventEmitterWithErrorHandling,
} from "@fluidframework/telemetry-utils/internal";
import { v4 as uuid } from "uuid";

import {
	IConnectionDetailsInternal,
	IConnectionManager,
	IConnectionManagerFactoryArgs,
	IConnectionStateChangeReason,
} from "./contracts.js";
import { DeltaQueue } from "./deltaQueue.js";
import { ThrottlingWarning } from "./error.js";

export interface IConnectionArgs {
	mode?: ConnectionMode;
	fetchOpsFromStorage?: boolean;
	reason: IConnectionStateChangeReason;
}

/**
 * Includes events emitted by the concrete implementation DeltaManager
 * but not exposed on the public interface IDeltaManager
 */
export interface IDeltaManagerInternalEvents extends IDeltaManagerEvents {
	(event: "throttled", listener: (error: IThrottlingWarning) => void);
	(event: "closed" | "disposed", listener: (error?: ICriticalContainerError) => void);
	(
		event: "connect",
		listener: (details: IConnectionDetailsInternal, opsBehind?: number) => void,
	);
	(event: "establishingConnection", listener: (reason: IConnectionStateChangeReason) => void);
	(
		event: "cancelEstablishingConnection",
		listener: (reason: IConnectionStateChangeReason) => void,
	);
}

/**
 * Batching makes assumptions about what might be on the metadata. This interface codifies those assumptions, but does not validate them.
 */
interface IBatchMetadata {
	batch?: boolean;
}

/**
 * Interface used to define a strategy for handling incoming delta messages
 */
export interface IDeltaHandlerStrategy {
	/**
	 * Processes the message.
	 */
	process: (message: ISequencedDocumentMessage) => void;

	/**
	 * Processes the signal.
	 */
	processSignal: (message: ISignalMessage) => void;
}

/**
 * Determines if message was sent by client, not service
 */
function isClientMessage(message: ISequencedDocumentMessage | IDocumentMessage): boolean {
	if (isRuntimeMessage(message)) {
		return true;
	}
	switch (message.type) {
		case MessageType.Propose:
		case MessageType.Reject:
		case MessageType.NoOp:
		case MessageType.Accept:
		case MessageType.Summarize: {
			return true;
		}
		default: {
			return false;
		}
	}
}

/**
 * Like assert, but logs only if the condition is false, rather than throwing
 * @param condition - The condition to attest too
 * @param logger - The logger to log with
 * @param event - The string or event to log
 * @returns The outcome of the condition
 */
function logIfFalse(
	condition: boolean,
	logger: ITelemetryLoggerExt,
	event: string | ITelemetryGenericEventExt,
): condition is true {
	if (condition) {
		return true;
	}
	const newEvent: ITelemetryBaseEvent =
		typeof event === "string"
			? { eventName: event, category: "error" }
			: { category: "error", ...event };
	logger.send(newEvent);
	return false;
}

/**
 * Manages the flow of both inbound and outbound messages. This class ensures that shared objects receive delta
 * messages in order regardless of possible network conditions or timings causing out of order delivery.
 */
export class DeltaManager<TConnectionManager extends IConnectionManager>
	extends EventEmitterWithErrorHandling<IDeltaManagerInternalEvents>
	implements IDeltaManagerFull, IEventProvider<IDeltaManagerInternalEvents>
{
	public readonly connectionManager: TConnectionManager;

	public get active(): boolean {
		return this._active();
	}

	public get disposed(): boolean {
		return this._closed;
	}

	public get IDeltaSender(): IDeltaSender {
		return this;
	}

	private pending: ISequencedDocumentMessage[] = [];
	private fetchReason: string | undefined;

	// A boolean used to assert that ops are not being sent while processing another op.
	private currentlyProcessingOps: boolean = false;

	// The minimum sequence number and last sequence number received from the server
	private minSequenceNumber: number = 0;

	// There are three numbers we track
	// * lastQueuedSequenceNumber is the last queued sequence number. If there are gaps in seq numbers, then this number
	//   is not updated until we cover that gap, so it increases each time by 1.
	// * lastObservedSeqNumber is an estimation of last known sequence number for container in storage. It's initially
	//   populated at web socket connection time (if storage provides that info) and is updated once ops shows up.
	//   It's never less than lastQueuedSequenceNumber
	// * lastProcessedSequenceNumber - last processed sequence number
	private lastQueuedSequenceNumber: number = 0;
	private lastObservedSeqNumber: number = 0;
	private lastProcessedSequenceNumber: number = 0;
	private lastProcessedMessage: ISequencedDocumentMessage | undefined;

	/**
	 * Count the number of noops sent by the client which may not be acked
	 */
	private noOpCount: number = 0;
	/**
	 * Track clientSequenceNumber of the last op
	 */
	private lastClientSequenceNumber: number = 0;

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

	private _closed = false;
	private _disposed = false;

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

	public get lastMessage(): ISequencedDocumentMessage | undefined {
		return this.lastProcessedMessage;
	}

	public get lastKnownSeqNumber(): number {
		return this.lastObservedSeqNumber;
	}

	public get minimumSequenceNumber(): number {
		return this.minSequenceNumber;
	}

	/**
	 * Tells if  current connection has checkpoint information.
	 * I.e. we know how far behind the client was at the time of establishing connection
	 */
	public get hasCheckpointSequenceNumber(): boolean {
		// Valid to be called only if we have active connection.
		assert(this.connectionManager.connected, 0x0df /* "Missing active connection" */);
		return this._checkpointSequenceNumber !== undefined;
	}

	// Forwarding connection manager properties / IDeltaManager implementation
	public get maxMessageSize(): number {
		return this.connectionManager.maxMessageSize;
	}
	public get version(): string {
		return this.connectionManager.version;
	}
	public get serviceConfiguration(): IClientConfiguration | undefined {
		return this.connectionManager.serviceConfiguration;
	}
	public get outbound(): IDeltaQueue<IDocumentMessage[]> {
		return this.connectionManager.outbound;
	}
	public get readOnlyInfo(): ReadOnlyInfo {
		return this.connectionManager.readOnlyInfo;
	}
	public get clientDetails(): IClientDetails {
		return this.connectionManager.clientDetails;
	}

	public submit(
		type: MessageType,
		contents?: string,
		batch = false,
		metadata?: unknown,
		compression?: string,
		referenceSequenceNumber?: number,
	): number {
		// Back-compat ADO:3455
		const backCompatRefSeqNum = referenceSequenceNumber ?? this.lastProcessedSequenceNumber;
		const messagePartial: Omit<IDocumentMessage, "clientSequenceNumber"> = {
			contents,
			metadata,
			referenceSequenceNumber: backCompatRefSeqNum,
			type,
			compression,
		};

		if (!batch) {
			this.flush();
		}
		const message = this.connectionManager.prepareMessageToSend(messagePartial);
		if (message === undefined) {
			return -1;
		}

		assert(isClientMessage(message), 0x419 /* client sends non-client message */);

		if (contents !== undefined) {
			this.opsSize += contents.length;
		}

		this.messageBuffer.push(message);

		if (message.type === MessageType.NoOp) {
			this.noOpCount++;
		}

		this.emit("submitOp", message);

		if (!batch) {
			this.flush();
		}
		return message.clientSequenceNumber;
	}

	public submitSignal(content: string, targetClientId?: string): void {
		return this.connectionManager.submitSignal(content, targetClientId);
	}

	public flush(): void {
		const batch = this.messageBuffer;
		if (batch.length === 0) {
			return;
		}

		this.messageBuffer = [];

		// The prepareFlush event allows listeners to append metadata to the batch prior to submission.
		this.emit("prepareSend", batch);

		if (batch.length === 1) {
			assert(
				(batch[0].metadata as IBatchMetadata)?.batch === undefined,
				0x3c9 /* no batch markup on single message */,
			);
		} else {
			assert(
				(batch[0].metadata as IBatchMetadata)?.batch === true,
				0x3ca /* no start batch markup */,
			);
			assert(
				(batch[batch.length - 1].metadata as IBatchMetadata)?.batch === false,
				0x3cb /* no end batch markup */,
			);
		}

		this.connectionManager.sendMessages(batch);

		assert(this.messageBuffer.length === 0, 0x3cc /* reentrancy */);
	}

	public get connectionProps(): ITelemetryBaseProperties {
		return {
			sequenceNumber: this.lastSequenceNumber,
			opsSize: this.opsSize > 0 ? this.opsSize : undefined,
			deltaManagerState: this._disposed ? "disposed" : this._closed ? "closed" : "open",
			...this.connectionManager.connectionProps,
		};
	}

	/**
	 * Log error event with a bunch of internal to DeltaManager information about state of op processing
	 * Used to diagnose connectivity issues related to op processing (i.e. cases where for some reason
	 * we stop processing ops that results in no processing join op and thus moving to connected state)
	 * @param event - Event to log.
	 */
	public logConnectionIssue(event: ITelemetryErrorEventExt): void {
		assert(this.connectionManager.connected, 0x238 /* "called only in connected state" */);

		const pendingSorted = this.pending.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
		this.logger.sendTelemetryEvent({
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
		private readonly logger: ITelemetryLoggerExt,
		private readonly _active: () => boolean,
		createConnectionManager: (props: IConnectionManagerFactoryArgs) => TConnectionManager,
	) {
		super((name, error) => {
			this.logger.sendErrorEvent(
				{
					eventName: "DeltaManagerEventHandlerException",
					name: typeof name === "string" ? name : undefined,
				},
				error,
			);
			this.close(normalizeError(error));
		});
		const props: IConnectionManagerFactoryArgs = {
			incomingOpHandler: (messages: ISequencedDocumentMessage[], reason: string) => {
				try {
					this.enqueueMessages(messages, reason);
				} catch (error) {
					this.logger.sendErrorEvent({ eventName: "EnqueueMessages_Exception" }, error);
					this.close(normalizeError(error));
				}
			},
			signalHandler: (signals: ISignalMessage[]) => {
				for (const signal of signals) {
					this._inboundSignal.push(signal);
				}
			},
			reconnectionDelayHandler: (delayMs: number, error: unknown) =>
				this.emitDelayInfo(this.deltaStreamDelayId, delayMs, error),
			closeHandler: (error: ICriticalContainerError | undefined) => this.close(error),
			disconnectHandler: (reason: IConnectionStateChangeReason) =>
				this.disconnectHandler(reason),
			connectHandler: (connection: IConnectionDetailsInternal) =>
				this.connectHandler(connection),
			pongHandler: (latency: number) => this.emit("pong", latency),
			readonlyChangeHandler: (
				readonly?: boolean,
				readonlyConnectionReason?: IConnectionStateChangeReason,
			) => {
				safeRaiseEvent(this, this.logger, "readonly", readonly, readonlyConnectionReason);
			},
			establishConnectionHandler: (reason: IConnectionStateChangeReason) =>
				this.establishingConnection(reason),
			cancelConnectionHandler: (reason: IConnectionStateChangeReason) =>
				this.cancelEstablishingConnection(reason),
		};

		this.connectionManager = createConnectionManager(props);
		this._inbound = new DeltaQueue<ISequencedDocumentMessage>((op) => {
			this.processInboundMessage(op);
		});

		this._inbound.on("error", (error) => {
			this.close(
				DataProcessingError.wrapIfUnrecognized(
					error,
					"deltaManagerInboundErrorHandler",
					this.lastMessage,
				),
			);
		});

		// Inbound signal queue
		this._inboundSignal = new DeltaQueue<ISignalMessage>((message) => {
			if (this.handler === undefined) {
				throw new Error("Attempted to process an inbound signal without a handler attached");
			}

			this.handler.processSignal({
				...message,
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

	private cancelEstablishingConnection(reason: IConnectionStateChangeReason): void {
		this.emit("cancelEstablishingConnection", reason);
	}

	private establishingConnection(reason: IConnectionStateChangeReason): void {
		this.emit("establishingConnection", reason);
	}

	private connectHandler(connection: IConnectionDetailsInternal): void {
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
		assert(
			this.messageBuffer.length === 0,
			0x0e9 /* "messageBuffer is not empty on new connection" */,
		);

		this.opsSize = 0;
		this.noOpCount = 0;

		this.emit(
			"connect",
			connection,
			checkpointSequenceNumber === undefined
				? undefined
				: this.lastObservedSeqNumber - this.lastSequenceNumber,
		);

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

	/**
	 * Sets the sequence number from which inbound messages should be returned
	 * @param snapshotSequenceNumber - The sequence number of the snapshot at which the document loaded from.
	 * @param lastProcessedSequenceNumber - The last processed sequence number, for offline, it should be greater than the sequence number.
	 * Setting lastProcessedSequenceNumber allows the DeltaManager to skip downloading and processing ops that have already been processed.
	 */
	public async attachOpHandler(
		minSequenceNumber: number,
		snapshotSequenceNumber: number,
		handler: IDeltaHandlerStrategy,
		prefetchType: "cached" | "all" | "none" = "none",
		lastProcessedSequenceNumber: number = snapshotSequenceNumber,
	): Promise<void> {
		this.initSequenceNumber = snapshotSequenceNumber;
		this.lastProcessedSequenceNumber = lastProcessedSequenceNumber;
		this.minSequenceNumber = minSequenceNumber;
		this.lastQueuedSequenceNumber = lastProcessedSequenceNumber;
		this.lastObservedSeqNumber = lastProcessedSequenceNumber;

		// We will use same check in other places to make sure all the seq number above are set properly.
		assert(
			this.handler === undefined,
			0x0e2 /* "DeltaManager already has attached op handler!" */,
		);
		this.handler = handler;
		// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
		assert(!!this.handler, 0x0e3 /* "Newly set op handler is null/undefined!" */);

		// There should be no pending fetch!
		// This API is called right after attachOpHandler by Container.load().
		// We might have connection already and it might have called fetchMissingDeltas() from
		// setupNewSuccessfulConnection. But it should do nothing, because there is no way to fetch ops before
		// we know snapshot sequence number that is set in attachOpHandler. So all such calls should be noop.
		assert(
			this.fetchReason === undefined,
			0x268 /* "There can't be pending fetch that early in boot sequence!" */,
		);

		if (this._closed) {
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
		assert(
			this.fetchReason !== undefined || this.pending.length === 0,
			0x269 /* "pending ops are not dropped" */,
		);
	}

	public connect(args: IConnectionArgs): void {
		const fetchOpsFromStorage = args.fetchOpsFromStorage ?? true;
		logIfFalse(
			this.handler !== undefined || !fetchOpsFromStorage,
			this.logger,
			"CantFetchWithoutBaseline",
		); // can't fetch if no baseline

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
			this.fetchMissingDeltas(args.reason.text);
		}

		this.connectionManager.connect(args.reason, args.mode);
	}

	private async getDeltas(
		from: number, // inclusive
		to: number | undefined, // exclusive
		fetchReason: string,
		callback: (messages: ISequencedDocumentMessage[]) => void,
		cacheOnly: boolean,
	): Promise<void> {
		const docService = this.serviceProvider();
		if (docService === undefined) {
			throw new Error("Delta manager is not attached");
		}

		if (this.deltaStorage === undefined) {
			this.deltaStorage = await docService.connectToDeltaStorage();
		}

		let cancelFetch: (op: ISequencedDocumentMessage) => boolean;

		if (to === undefined) {
			// Unbound requests are made to proactively fetch ops, but also get up to date in cases where socket
			// is silent (and connection is "read", thus we might not have any data on how far client is behind).
			// Once we have any op coming in from socket, we can cancel it as it's not needed any more.
			// That said, if we have socket connection, make sure we got ops up to checkpointSequenceNumber!
			cancelFetch = (op: ISequencedDocumentMessage): boolean =>
				op.sequenceNumber >= this.lastObservedSeqNumber;
		} else {
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
			cancelFetch = (op: ISequencedDocumentMessage): boolean =>
				op.sequenceNumber >= lastExpectedOp;
		}

		const controller = new AbortController();
		let opsFromFetch = false;

		const opListener = (op: ISequencedDocumentMessage): void => {
			assert(op.sequenceNumber === this.lastQueuedSequenceNumber, 0x23a /* "seq#'s" */);
			// Ops that are coming from this request should not cancel itself.
			// This is useless for known ranges (to is defined) as it means request is over either way.
			// And it will cancel unbound request too early, not allowing us to learn where the end of the file is.
			if (!opsFromFetch && cancelFetch(op)) {
				controller.abort("DeltaManager getDeltas fetch cancelled");
				this._inbound.off("push", opListener);
			}
		};

		try {
			this._inbound.on("push", opListener);
			assert(this.closeAbortController.signal.onabort === null, 0x1e8 /* "reentrancy" */);
			this.closeAbortController.signal.addEventListener("abort", () =>
				controller.abort(this.closeAbortController.signal.reason),
			);

			const stream = this.deltaStorage.fetchMessages(
				from, // inclusive
				to, // exclusive
				controller.signal,
				cacheOnly,
				fetchReason,
			);

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
			if (controller.signal.aborted) {
				this.logger.sendTelemetryEvent({
					eventName: "DeltaManager_GetDeltasAborted",
					fetchReason,
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					reason: controller.signal.reason,
				});
			}
			// eslint-disable-next-line unicorn/no-null, unicorn/prefer-add-event-listener
			this.closeAbortController.signal.onabort = null;
			this._inbound.off("push", opListener);
			assert(!opsFromFetch, 0x289 /* "logic error" */);
		}
	}

	/**
	 * Closes the connection and clears inbound & outbound queues.
	 *
	 * Differences from dispose:
	 * - close will trigger readonly notification
	 * - close emits "closed"
	 * - close cannot be called after dispose
	 */
	public close(error?: ICriticalContainerError): void {
		if (this._closed) {
			return;
		}
		this._closed = true;

		this.connectionManager.dispose(error, true /* switchToReadonly */);
		this.clearQueues();
		this.emit("closed", error);
	}

	/**
	 * Disposes the connection and clears the inbound & outbound queues.
	 *
	 * Differences from close:
	 * - dispose will emit "disposed"
	 * - dispose will remove all listeners
	 * - dispose can be called after closure
	 */
	public dispose(error?: Error | ICriticalContainerError): void {
		if (this._disposed) {
			return;
		}
		if (error !== undefined && !isFluidError(error)) {
			throw new UsageError("Error must be a Fluid error");
		}

		this._disposed = true;
		this._closed = true; // We consider "disposed" as a further state than "closed"

		this.connectionManager.dispose(error, false /* switchToReadonly */);
		this.clearQueues();

		// This needs to be the last thing we do (before removing listeners), as it causes
		// Container to dispose context and break ability of data stores / runtime to "hear" from delta manager.
		this.emit("disposed", error);
		this.removeAllListeners();
	}

	private clearQueues(): void {
		this.closeAbortController.abort("DeltaManager is closed");

		this._inbound.clear();
		this._inboundSignal.clear();

		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		this._inbound.pause();
		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		this._inboundSignal.pause();

		// Drop pending messages - this will ensure catchUp() does not go into infinite loop
		this.pending = [];
	}

	public refreshDelayInfo(id: string): void {
		this.throttlingIdSet.delete(id);
		if (this.throttlingIdSet.size === 0) {
			this.timeTillThrottling = 0;
		}
	}

	private disconnectHandler(reason: IConnectionStateChangeReason): void {
		this.messageBuffer.length = 0;
		this.emit("disconnect", reason.text, reason.error);
	}

	/**
	 * Emit info about a delay in service communication on account of throttling.
	 * @param id - Id of the connection that is delayed
	 * @param delayMs - Duration of the delay
	 * @param error - error object indicating the throttling
	 */
	public emitDelayInfo(id: string, delayMs: number, error: unknown): void {
		const timeNow = Date.now();
		this.throttlingIdSet.add(id);
		if (delayMs > 0 && timeNow + delayMs > this.timeTillThrottling) {
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
	// Also payload goes to telemetry, so no content or anything else that shouldn't be logged for privacy reasons
	// Note: It's possible for a duplicate op to be broadcasted and have everything the same except the timestamp.
	private comparableMessagePayload(m: ISequencedDocumentMessage): string {
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
			this.pending = [...this.pending, ...messages];
			return;
		}

		// Pending ops should never just hang around for nothing.
		// This invariant will stay true through this function execution,
		// so there is no need to process pending ops here.
		// It's responsibility of
		// - attachOpHandler()
		// - fetchMissingDeltas() after it's done with querying storage
		assert(
			this.pending.length === 0 || this.fetchReason !== undefined,
			0x1e9 /* "Pending ops" */,
		);

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
			if (
				duplicate !== 0 ||
				(gap !== 0 && !allowGaps) ||
				(initialGap > 0 && this.fetchReason === undefined)
			) {
				eventName = "enqueueMessages";
				// Also report if we are fetching ops, and same range comes in, thus making this fetch obsolete.
			} else if (
				this.fetchReason !== undefined &&
				this.fetchReason !== reason &&
				from <= this.lastQueuedSequenceNumber + 1 &&
				last > this.lastQueuedSequenceNumber
			) {
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
					initialGap: initialGap === 0 ? undefined : initialGap,
					gap: gap > 0 ? gap : undefined,
					firstMissing,
					dmInitialSeqNumber: this.initialSequenceNumber,
					...this.connectionManager.connectionVerboseProps,
				});
			}
		}

		this.updateLatestKnownOpSeqNumber(messages[messages.length - 1].sequenceNumber);

		const n = this.previouslyProcessedMessage?.sequenceNumber;
		assert(
			n === undefined || n === this.lastQueuedSequenceNumber,
			0x0ec /* "Unexpected value for previously processed message's sequence number" */,
		);

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
							"Found two messages with the same sequenceNumber but different payloads. Likely to be a " +
								"service issue",
							DriverErrorTypes.fileOverwrittenInStorage,
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
			} else if (message.sequenceNumber === this.lastQueuedSequenceNumber + 1) {
				this.lastQueuedSequenceNumber = message.sequenceNumber;
				this.previouslyProcessedMessage = message;
				this._inbound.push(message);
			} else {
				this.pending.push(message);
				this.fetchMissingDeltas(reason, message.sequenceNumber);
			}
		}

		// When / if we report a gap in ops in the future, we want telemetry to correctly reflect source
		// of prior ops. But if we have some out of order ops (this.pending), then reporting current reason
		// becomes not accurate, as the gap existed before current batch, so we should just report "unknown".
		this.prevEnqueueMessagesReason = this.pending.length > 0 ? "unknown" : reason;
	}

	private processInboundMessage(message: ISequencedDocumentMessage): void {
		const startTime = Date.now();
		assert(!this.currentlyProcessingOps, 0x3af /* Already processing ops. */);
		this.currentlyProcessingOps = true;
		this.lastProcessedMessage = message;

		const isString = typeof message.clientId === "string";
		assert(message.clientId === null || isString, 0x41a /* undefined or string */);
		// All client messages are coming from some client, and should have clientId,
		// and non-client message should not have clientId. But, there are two exceptions:
		// 1. (Legacy) We can see message.type === "attach" or "chunkedOp" for legacy files before RTM
		// 2. Non-immediate noops (contents: null) can be sent by service without clientId
		if (!isString && isClientMessage(message) && message.type !== MessageType.NoOp) {
			throw new DataCorruptionError("Mismatch in clientId", {
				...extractSafePropertiesFromMessage(message),
				messageType: message.type,
			});
		}

		// Validate client sequence number has no gap. Decrement the noOpCount by gap
		// If the count ends up negative, that means we have a real gap and throw error
		if (
			this.connectionManager.clientId !== undefined &&
			this.connectionManager.clientId === message.clientId
		) {
			if (message.type === MessageType.NoOp) {
				this.noOpCount--;
			}
			const clientSeqNumGap = message.clientSequenceNumber - this.lastClientSequenceNumber - 1;
			this.noOpCount -= clientSeqNumGap;
			if (this.noOpCount < 0) {
				throw new Error(`gap in client sequence number: ${clientSeqNumGap}`);
			}
			this.lastClientSequenceNumber = message.clientSequenceNumber;
		}

		this.connectionManager.beforeProcessingIncomingOp(message);

		// Watch the minimum sequence number and be ready to update as needed
		if (this.minSequenceNumber > message.minimumSequenceNumber) {
			// This indicates that an invalid series of ops was received by this client.
			// In the unlikely case where these ops have been truly sequenced and persisted to storage,
			// this document is corrupted - It will fail here on boot every time.
			// The more likely scenario, based on the realities of production service operation, is that
			// something has changed out from under the file on the server, such that the service lost some ops
			// which this client already processed - the very ops that made this _next_ op to appear invalid.
			// In this case, only this client will fail (and lose this recent data), but others will be able to connect and continue.
			throw DataProcessingError.create(
				// error message through v0.57: msnMovesBackwards
				// error message through v2.1: "Found a lower minimumSequenceNumber (msn) than previously recorded",
				"Invalid MinimumSequenceNumber from service - document may have been restored to previous state",
				"DeltaManager.processInboundMessage",
				message,
				{
					clientId: this.connectionManager.clientId,
				},
			);
		}

		// Client ops: MSN has to be lower than sequence #, as client can continue to send ops with same
		// reference sequence number as this op.
		// System ops (when no clients are connected) are the only ops where equation is possible.
		const diff = message.sequenceNumber - message.minimumSequenceNumber;
		if (diff < 0 || (diff === 0 && message.clientId !== null)) {
			throw new DataCorruptionError(
				"MSN has to be lower than sequence #",
				extractSafePropertiesFromMessage(message),
			);
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
		assert(
			this.lastProcessedSequenceNumber <= this.lastObservedSeqNumber,
			0x267 /* "lastObservedSeqNumber should be updated first" */,
		);

		if (this.handler === undefined) {
			throw new Error("Attempted to process an inbound message without a handler attached");
		}
		this.handler.process(message);
		this.currentlyProcessingOps = false;
		const endTime = Date.now();

		// Should be last, after changing this.lastProcessedSequenceNumber above, as many callers
		// test this.lastProcessedSequenceNumber instead of using op.sequenceNumber itself.
		this.emit("op", message, endTime - startTime);
	}

	/**
	 * Retrieves the missing deltas between the given sequence numbers
	 */
	private fetchMissingDeltas(reasonArg: string, to?: number): void {
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
		to?: number,
	): Promise<void> {
		// Exit out early if we're already fetching deltas
		if (this.fetchReason !== undefined) {
			return;
		}

		if (this._closed) {
			this.logger.sendTelemetryEvent({
				eventName: "fetchMissingDeltasClosedConnection",
				reason,
			});
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
				cacheOnly,
			);
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
		if (this._closed) {
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
			// eslint-disable-next-line unicorn/no-lonely-if -- Docs make more sense like this
			if (this.lastQueuedSequenceNumber < this.lastObservedSeqNumber) {
				this.fetchMissingDeltas("OpsBehind");
			}
		}
	}

	private updateLatestKnownOpSeqNumber(seq: number): void {
		if (this.lastObservedSeqNumber < seq) {
			this.lastObservedSeqNumber = seq;
		}
	}
}
