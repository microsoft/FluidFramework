/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IDisposable,
	ITelemetryBaseProperties,
	LogLevel,
} from "@fluidframework/core-interfaces";
import { DisconnectReason } from "@fluidframework/core-interfaces/internal";
import { assert } from "@fluidframework/core-utils/internal";
import { ConnectionMode } from "@fluidframework/driver-definitions";
import {
	IAnyDriverError,
	IDocumentDeltaConnection,
	IDocumentDeltaConnectionEvents,
	IClientConfiguration,
	IConnect,
	IConnected,
	IDocumentMessage,
	type ISentSignalMessage,
	ISignalClient,
	ITokenClaims,
	ScopeType,
	ISequencedDocumentMessage,
	ISignalMessage,
} from "@fluidframework/driver-definitions/internal";
import {
	UsageError,
	createGenericNetworkError,
	type DriverErrorTelemetryProps,
} from "@fluidframework/driver-utils/internal";
import {
	ITelemetryLoggerExt,
	EventEmitterWithErrorHandling,
	MonitoringContext,
	createChildMonitoringContext,
	extractLogSafeErrorProperties,
	getCircularReplacer,
	normalizeError,
} from "@fluidframework/telemetry-utils/internal";
import type { Socket } from "socket.io-client";

// For now, this package is versioned and released in unison with the specific drivers
import { pkgVersion as driverVersion } from "./packageVersion.js";

const feature_submit_signals_v2 = "submit_signals_v2";

/**
 * Represents a connection to a stream of delta updates.
 * @internal
 */
export class DocumentDeltaConnection
	extends EventEmitterWithErrorHandling<IDocumentDeltaConnectionEvents>
	implements IDocumentDeltaConnection, IDisposable
{
	static readonly eventsToForward = ["nack", "op", "signal", "pong"];

	// WARNING: These are critical events that we can't miss, so registration for them has to be in place at all times!
	// Including before handshake is over, and after that (but before DeltaManager had a chance to put its own handlers)
	static readonly eventsAlwaysForwarded = ["disconnect", "error"];

	/**
	 * Last known sequence number to ordering service at the time of connection
	 * It may lap actual last sequence number (quite a bit, if container  is very active).
	 * But it's best information for client to figure out how far it is behind, at least
	 * for "read" connections. "write" connections may use own "join" op to similar information,
	 * that is likely to be more up-to-date.
	 */
	public checkpointSequenceNumber: number | undefined;

	// Listen for ops sent before we receive a response to connect_document
	protected readonly queuedMessages: ISequencedDocumentMessage[] = [];
	protected readonly queuedSignals: ISignalMessage[] = [];

	/**
	 * A flag to indicate whether we have our handler attached.  If it's attached, we're queueing incoming ops
	 * to later be retrieved via initialMessages.
	 */
	private earlyOpHandlerAttached: boolean = false;

	private socketConnectionTimeout: ReturnType<typeof setTimeout> | undefined;

	private _details: IConnected | undefined;

	private trackLatencyTimeout: ReturnType<typeof setTimeout> | undefined;

	// Listeners only needed while the connection is in progress
	private readonly connectionListeners: Map<string, (...args: any[]) => void> = new Map();
	// Listeners used throughout the lifetime of the DocumentDeltaConnection
	private readonly trackedListeners: Map<string, (...args: any[]) => void> = new Map();

	protected get hasDetails(): boolean {
		return !!this._details;
	}

	public get disposed() {
		assert(
			this._disposed || this.socket.connected,
			0x244 /* "Socket is closed, but connection is not!" */,
		);
		return this._disposed;
	}

	/**
	 * Flag to indicate whether the DocumentDeltaConnection is expected to still be capable of sending messages.
	 * After disconnection, we flip this to prevent any stale messages from being emitted.
	 */
	protected _disposed: boolean = false;
	private readonly mc: MonitoringContext;

	/**
	 * @deprecated Implementors should manage their own logger or monitoring context
	 */
	protected get logger(): ITelemetryLoggerExt {
		return this.mc.logger;
	}

	public get details(): IConnected {
		if (!this._details) {
			throw new Error("Internal error: calling method before _details is initialized!");
		}
		return this._details;
	}

	/**
	 * @param socket - websocket to be used
	 * @param documentId - ID of the document
	 * @param logger - for reporting telemetry events
	 * @param enableLongPollingDowngrades - allow connection to be downgraded to long-polling on websocket failure
	 */
	protected constructor(
		protected readonly socket: Socket,
		public documentId: string,
		logger: ITelemetryLoggerExt,
		private readonly enableLongPollingDowngrades: boolean = false,
		protected readonly connectionId?: string,
	) {
		super((name, error) => {
			this.addPropsToError(error);
			logger.sendErrorEvent(
				{
					eventName: "DeltaConnection:EventException",
					// Coerce to string as past typings also allowed symbols and number, but
					// we want telemtry properties to be consistently string.
					name: String(name),
				},
				error,
			);
		});

		this.mc = createChildMonitoringContext({ logger, namespace: "DeltaConnection" });

		this.on("newListener", (event, _listener) => {
			assert(!this.disposed, 0x20a /* "register for event on disposed object" */);

			// Some events are already forwarded - see this.addTrackedListener() calls in initialize().
			if (DocumentDeltaConnection.eventsAlwaysForwarded.includes(event)) {
				assert(this.trackedListeners.has(event), 0x245 /* "tracked listener" */);
				return;
			}

			if (!DocumentDeltaConnection.eventsToForward.includes(event)) {
				throw new Error(`DocumentDeltaConnection: Registering for unknown event: ${event}`);
			}

			// Whenever listener is added, we should subscribe on same event on socket, so these two things
			// should be in sync. This currently assumes that nobody unregisters and registers back listeners,
			// and that there are no "internal" listeners installed (like "error" case we skip above)
			// Better flow might be to always unconditionally register all handlers on successful connection,
			// though some logic (naming assert in initialMessages getter) might need to be adjusted (it becomes noop)
			assert(
				(this.listeners(event).length !== 0) === this.trackedListeners.has(event),
				0x20b /* "mismatch" */,
			);
			if (!this.trackedListeners.has(event)) {
				if (event === "pong") {
					// Empty callback for tracking purposes in this class
					this.trackedListeners.set("pong", () => {});

					const sendPingLoop = () => {
						const start = Date.now();

						this.socket.volatile?.emit("ping", () => {
							this.emit("pong", Date.now() - start);

							// Schedule another ping event in 1 minute
							this.trackLatencyTimeout = setTimeout(() => {
								sendPingLoop();
							}, 1000 * 60);
						});
					};

					sendPingLoop();
				} else {
					this.addTrackedListener(event, (...args: any[]) => {
						this.emit(event, ...args);
					});
				}
			}
		});
	}

	/**
	 * Get the ID of the client who is sending the message
	 *
	 * @returns the client ID
	 */
	public get clientId(): string {
		return this.details.clientId;
	}

	/**
	 * Get the mode of the client
	 *
	 * @returns the client mode
	 */
	public get mode(): ConnectionMode {
		return this.details.mode;
	}

	/**
	 * Get the claims of the client who is sending the message
	 *
	 * @returns client claims
	 */
	public get claims(): ITokenClaims {
		return this.details.claims;
	}

	/**
	 * Get whether or not this is an existing document
	 *
	 * @returns true if the document exists
	 */
	public get existing(): boolean {
		return this.details.existing;
	}

	/**
	 * Get the maximum size of a message before chunking is required
	 *
	 * @returns the maximum size of a message before chunking is required
	 */
	public get maxMessageSize(): number {
		return this.details.serviceConfiguration.maxMessageSize;
	}

	/**
	 * Semver of protocol being used with the service
	 */
	public get version(): string {
		return this.details.version;
	}

	/**
	 * Configuration details provided by the service
	 */
	public get serviceConfiguration(): IClientConfiguration {
		return this.details.serviceConfiguration;
	}

	private checkNotDisposed() {
		assert(!this.disposed, 0x20c /* "connection disposed" */);
	}

	/**
	 * Get messages sent during the connection
	 *
	 * @returns messages sent during the connection
	 */
	public get initialMessages(): ISequencedDocumentMessage[] {
		this.checkNotDisposed();

		// If we call this when the earlyOpHandler is not attached, then the queuedMessages may not include the
		// latest ops.  This could possibly indicate that initialMessages was called twice.
		assert(this.earlyOpHandlerAttached, 0x08e /* "Potentially missed initial messages" */);
		// We will lose ops and perf will tank as we need to go to storage to become current!
		assert(this.listeners("op").length !== 0, 0x08f /* "No op handler is setup!" */);

		this.removeEarlyOpHandler();

		if (this.queuedMessages.length > 0) {
			// Some messages were queued.
			// add them to the list of initialMessages to be processed
			this.details.initialMessages.push(...this.queuedMessages);
			this.details.initialMessages.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
			this.queuedMessages.length = 0;
		}
		return this.details.initialMessages;
	}

	/**
	 * Get signals sent during the connection
	 *
	 * @returns signals sent during the connection
	 */
	public get initialSignals(): ISignalMessage[] {
		this.checkNotDisposed();
		assert(this.listeners("signal").length !== 0, 0x090 /* "No signal handler is setup!" */);

		this.removeEarlySignalHandler();

		if (this.queuedSignals.length > 0) {
			// Some signals were queued.
			// add them to the list of initialSignals to be processed
			this.details.initialSignals.push(...this.queuedSignals);
			this.queuedSignals.length = 0;
		}
		return this.details.initialSignals;
	}

	/**
	 * Get initial client list
	 *
	 * @returns initial client list sent during the connection
	 */
	public get initialClients(): ISignalClient[] {
		this.checkNotDisposed();
		return this.details.initialClients;
	}
	/**
	 * Emits 'submitOp' messages.
	 * @param type - Must be 'submitOp'.
	 * @param messages - An array of document messages to submit.
	 */
	protected emitMessages(type: "submitOp", messages: IDocumentMessage[][]): void;

	/**
	 * Emits 'submitSignal' messages.
	 *
	 * **Note:** When using `ISentSignalMessage[]`, the service must support the `submit_signals_v2` feature.
	 * @param type - Must be 'submitSignal'.
	 * @param messages - An array of signals to submit. Can be either `string[][]` or `ISentSignalMessage[]`.
	 */
	protected emitMessages(
		type: "submitSignal",
		messages: string[][] | ISentSignalMessage[],
	): void;
	protected emitMessages(type: string, messages: unknown): void {
		// Although the implementation here disconnects the socket and does not reuse it, other subclasses
		// (e.g. OdspDocumentDeltaConnection) may reuse the socket.  In these cases, we need to avoid emitting
		// on the still-live socket.
		if (!this.disposed) {
			this.socket.emit(type, this.clientId, messages);
		}
	}

	/**
	 * Submits a new delta operation to the server
	 *
	 * @param message - delta operation to submit
	 */
	public submit(messages: IDocumentMessage[]): void {
		this.checkNotDisposed();
		this.emitMessages("submitOp", [messages]);
	}

	/**
	 * Submits a new signal to the server
	 *
	 * @param content - Content of the signal.
	 * @param targetClientId - When specified, the signal is only sent to the provided client id.
	 */
	public submitSignal(content: string, targetClientId?: string): void {
		this.checkNotDisposed();

		// Check for server-side support of v2 signals
		if (this.details.supportedFeatures?.submit_signals_v2 === true) {
			const signal: ISentSignalMessage = { content };
			if (targetClientId !== undefined) {
				signal.targetClientId = targetClientId;
			}
			this.emitMessages("submitSignal", [signal]);
		} else if (targetClientId !== undefined) {
			throw new UsageError(
				"Sending signals to specific client ids is not supported with this service.",
			);
		} else {
			this.emitMessages("submitSignal", [[content]]);
		}
	}

	/**
	 * Disconnect from the websocket and close the websocket too.
	 */
	private closeSocket(error: IAnyDriverError) {
		if (this._disposed) {
			// This would be rare situation due to complexity around socket emitting events.
			return;
		}
		this.closeSocketCore(error);
	}

	protected closeSocketCore(error: IAnyDriverError) {
		this.disconnect(error);
	}

	/**
	 * Disconnect from the websocket, and permanently disable this DocumentDeltaConnection and close the socket.
	 * However the OdspDocumentDeltaConnection differ in dispose as in there we don't close the socket. There is no
	 * multiplexing here, so we need to close the socket here.
	 */
	public dispose(error?: Error) {
		this.logger.sendTelemetryEvent({
			eventName: "ClientClosingDeltaConnection",
			driverVersion,
			details: JSON.stringify({
				...this.getConnectionDetailsProps(),
			}),
		});

		this.disconnect(
			createGenericNetworkError(
				// pre-0.58 error message: clientClosingConnection
				this.getDisconnectionMessage(error),
				{ canRetry: true },
				{ driverVersion },
			),
		);
	}

	private getDisconnectionMessage(error?: Error) {
		const DEFAULT_MESSAGE = "Client closing delta connection";

		if (!error) {
			return DEFAULT_MESSAGE;
		}

		const hasDisconnectReason = Object.values(DisconnectReason).some((reason) =>
			error.message?.includes(reason),
		);

		return hasDisconnectReason ? error.message : DEFAULT_MESSAGE;
	}

	protected disconnect(err: IAnyDriverError) {
		// Can't check this.disposed here, as we get here on socket closure,
		// so _disposed & socket.connected might be not in sync while processing
		// "dispose" event.
		if (this._disposed) {
			return;
		}

		if (this.trackLatencyTimeout !== undefined) {
			clearTimeout(this.trackLatencyTimeout);
			this.trackLatencyTimeout = undefined;
		}

		// We set the disposed flag as a part of the contract for overriding the disconnect method. This is used by
		// DocumentDeltaConnection to determine if emitting messages (ops) on the socket is allowed, which is
		// important since OdspDocumentDeltaConnection reuses the socket rather than truly disconnecting it. Note that
		// OdspDocumentDeltaConnection may still send disconnect_document which is allowed; this is only intended
		// to prevent normal messages from being emitted.
		this._disposed = true;

		// Remove all listeners listening on the socket. These are listeners on socket and not on this connection
		// object. Anyway since we have disposed this connection object, nobody should listen to event on socket
		// anymore.
		this.removeTrackedListeners();

		// Clear the connection/socket before letting the deltaManager/connection manager know about the disconnect.
		this.disconnectCore(err);

		// Let user of connection object know about disconnect.
		this.emit("disconnect", err);
	}

	/**
	 * Disconnect from the websocket.
	 * @param reason - reason for disconnect
	 */
	protected disconnectCore(err: IAnyDriverError) {
		this.socket.disconnect();
	}

	protected async initialize(connectMessage: IConnect, timeout: number) {
		this.socket.on("op", this.earlyOpHandler);
		this.socket.on("signal", this.earlySignalHandler);
		this.earlyOpHandlerAttached = true;

		connectMessage.supportedFeatures = {
			...connectMessage.supportedFeatures,
			[feature_submit_signals_v2]: true,
		};

		// Socket.io's reconnect_attempt event is unreliable, so we track connect_error count instead.
		let internalSocketConnectionFailureCount: number = 0;
		const isInternalSocketReconnectionEnabled = (): boolean => this.socket.io.reconnection();
		const getMaxInternalSocketReconnectionAttempts = (): number =>
			isInternalSocketReconnectionEnabled() ? this.socket.io.reconnectionAttempts() : 0;
		const getMaxAllowedInternalSocketConnectionFailures = (): number =>
			getMaxInternalSocketReconnectionAttempts() + 1;

		this._details = await new Promise<IConnected>((resolve, reject) => {
			const failAndCloseSocket = (err: IAnyDriverError) => {
				try {
					this.closeSocket(err);
				} catch (failError) {
					const normalizedError = this.addPropsToError(failError);
					this.logger.sendErrorEvent({ eventName: "CloseSocketError" }, normalizedError);
				}
				reject(err);
			};

			const failConnection = (err: IAnyDriverError) => {
				try {
					this.disconnect(err);
				} catch (failError) {
					const normalizedError = this.addPropsToError(failError);
					this.logger.sendErrorEvent({ eventName: "FailConnectionError" }, normalizedError);
				}
				reject(err);
			};

			// Immediately set the connection timeout.
			// Give extra 2 seconds for handshake on top of socket connection timeout.
			this.socketConnectionTimeout = setTimeout(() => {
				failConnection(this.createErrorObject("orderingServiceHandshakeTimeout"));
			}, timeout + 2000);

			// Listen for connection issues
			this.addConnectionListener("connect_error", (error) => {
				internalSocketConnectionFailureCount++;
				let isWebSocketTransportError = false;
				try {
					const description = error?.description;
					const context = error?.context;

					if (context && typeof context === "object") {
						const statusText = context.statusText?.code;

						// Self-Signed Certificate ErrorCode Found in error.context
						if (statusText === "DEPTH_ZERO_SELF_SIGNED_CERT") {
							failAndCloseSocket(this.createErrorObject("connect_error", error, false));
							return;
						}
					} else if (description && typeof description === "object") {
						const errorCode = description.error?.code;

						// Self-Signed Certificate ErrorCode Found in error.description
						if (errorCode === "DEPTH_ZERO_SELF_SIGNED_CERT") {
							failAndCloseSocket(this.createErrorObject("connect_error", error, false));
							return;
						}

						if (error.type === "TransportError") {
							isWebSocketTransportError = true;
						}

						// That's a WebSocket. Clear it as we can't log it.
						description.target = undefined;
					}
				} catch (_e) {}

				// Handle socket transport downgrading when not offline.
				if (
					isWebSocketTransportError &&
					this.enableLongPollingDowngrades &&
					this.socket.io.opts.transports?.[0] !== "polling"
				) {
					// Downgrade transports to polling upgrade mechanism.
					this.socket.io.opts.transports = ["polling", "websocket"];
					// Don't alter reconnection behavior if already enabled.
					if (!isInternalSocketReconnectionEnabled()) {
						// Allow single reconnection attempt using polling upgrade mechanism.
						this.socket.io.reconnection(true);
						this.socket.io.reconnectionAttempts(1);
					}
				}

				// Allow built-in socket.io reconnection handling.
				if (
					isInternalSocketReconnectionEnabled() &&
					internalSocketConnectionFailureCount <
						getMaxAllowedInternalSocketConnectionFailures()
				) {
					// Reconnection is enabled and maximum reconnect attempts have not been reached.
					return;
				}

				failAndCloseSocket(this.createErrorObject("connect_error", error));
			});

			// Listen for timeouts
			this.addConnectionListener("connect_timeout", () => {
				failAndCloseSocket(this.createErrorObject("connect_timeout"));
			});

			this.addConnectionListener("connect_document_success", (response: IConnected) => {
				// If we sent a nonce and the server supports nonces, check that the nonces match
				if (
					connectMessage.nonce !== undefined &&
					response.nonce !== undefined &&
					response.nonce !== connectMessage.nonce
				) {
					return;
				}

				const requestedMode = connectMessage.mode;
				const actualMode = response.mode;
				const writingPermitted = response.claims.scopes.includes(ScopeType.DocWrite);

				if (writingPermitted) {
					// The only time we expect a mismatch in requested/actual is if we lack write permissions
					// In this case we will get "read", even if we requested "write"
					if (actualMode !== requestedMode) {
						failConnection(
							this.createErrorObject(
								"connect_document_success",
								"Connected in a different mode than was requested",
								false,
							),
						);
						return;
					}
				} else {
					if (actualMode === "write") {
						failConnection(
							this.createErrorObject(
								"connect_document_success",
								"Connected in write mode without write permissions",
								false,
							),
						);
						return;
					}
				}

				this.logger.sendTelemetryEvent(
					{
						eventName: "ConnectDocumentSuccess",
						pendingClientId: response.clientId,
					},
					undefined,
					LogLevel.verbose,
				);

				this.checkpointSequenceNumber = response.checkpointSequenceNumber;

				this.removeConnectionListeners();
				resolve(response);
			});

			// Socket can be disconnected while waiting for Fluid protocol messages
			// (connect_document_error / connect_document_success), as well as before DeltaManager
			// had a chance to register its handlers.
			this.addTrackedListener("disconnect", (reason, details) => {
				failAndCloseSocket(
					this.createErrorObjectWithProps("disconnect", reason, {
						socketErrorType: details?.context?.type,
						// https://www.rfc-editor.org/rfc/rfc6455#section-7.4
						socketCode: details?.context?.code,
					}),
				);
			});

			this.addTrackedListener("error", (error) => {
				// This includes "Invalid namespace" error, which we consider critical (reconnecting will not help)
				const err = this.createErrorObject("error", error, error !== "Invalid namespace");
				// Disconnect socket - required if happened before initial handshake
				failAndCloseSocket(err);
			});

			this.addConnectionListener("connect_document_error", (error) => {
				// If we sent a nonce and the server supports nonces, check that the nonces match
				if (
					connectMessage.nonce !== undefined &&
					error.nonce !== undefined &&
					error.nonce !== connectMessage.nonce
				) {
					return;
				}

				// This is not an socket.io error - it's Fluid protocol error.
				// In this case fail connection and indicate that we were unable to create connection
				failConnection(this.createErrorObject("connect_document_error", error));
			});

			this.socket.emit("connect_document", connectMessage);
		});

		assert(!this.disposed, 0x246 /* "checking consistency of socket & _disposed flags" */);
	}

	private addPropsToError(errorToBeNormalized: unknown) {
		const normalizedError = normalizeError(errorToBeNormalized, {
			props: {
				details: JSON.stringify({
					...this.getConnectionDetailsProps(),
				}),
			},
		});
		return normalizedError;
	}

	protected getConnectionDetailsProps() {
		return {
			disposed: this._disposed,
			socketConnected: this.socket?.connected,
			clientId: this._details?.clientId,
			connectionId: this.connectionId,
		};
	}

	protected earlyOpHandler = (documentId: string, msgs: ISequencedDocumentMessage[]) => {
		this.queuedMessages.push(...msgs);
	};

	protected earlySignalHandler = (msg: ISignalMessage | ISignalMessage[]) => {
		if (Array.isArray(msg)) {
			this.queuedSignals.push(...msg);
		} else {
			this.queuedSignals.push(msg);
		}
	};

	private removeEarlyOpHandler() {
		this.socket.removeListener("op", this.earlyOpHandler);
		this.earlyOpHandlerAttached = false;
	}

	private removeEarlySignalHandler() {
		this.socket.removeListener("signal", this.earlySignalHandler);
	}

	private addConnectionListener(event: string, listener: (...args: any[]) => void) {
		assert(
			!DocumentDeltaConnection.eventsAlwaysForwarded.includes(event),
			0x247 /* "Use addTrackedListener instead" */,
		);
		assert(
			!DocumentDeltaConnection.eventsToForward.includes(event),
			0x248 /* "should not subscribe to forwarded events" */,
		);
		this.socket.on(event, listener);
		assert(!this.connectionListeners.has(event), 0x20d /* "double connection listener" */);
		this.connectionListeners.set(event, listener);
	}

	protected addTrackedListener(event: string, listener: (...args: any[]) => void) {
		this.socket.on(event, listener);
		assert(!this.trackedListeners.has(event), 0x20e /* "double tracked listener" */);
		this.trackedListeners.set(event, listener);
	}

	private removeTrackedListeners() {
		for (const [event, listener] of this.trackedListeners.entries()) {
			this.socket.off(event, listener);
		}
		// removeTrackedListeners removes all listeners, including connection listeners
		this.removeConnectionListeners();

		this.removeEarlyOpHandler();
		this.removeEarlySignalHandler();

		this.trackedListeners.clear();
	}

	private removeConnectionListeners() {
		if (this.socketConnectionTimeout !== undefined) {
			clearTimeout(this.socketConnectionTimeout);
		}

		for (const [event, listener] of this.connectionListeners.entries()) {
			this.socket.off(event, listener);
		}
		this.connectionListeners.clear();
	}

	private getErrorMessage(error?: any): string {
		if (error?.type !== "TransportError") {
			return extractLogSafeErrorProperties(error, true).message;
		}
		// JSON.stringify drops Error.message
		const messagePrefix = error?.message !== undefined ? `${error.message}: ` : "";

		// Websocket errors reported by engine.io-client.
		// They are Error objects with description containing WS error and description = "TransportError"
		// Please see https://github.com/socketio/engine.io-client/blob/7245b80/lib/transport.ts#L44,
		return `${messagePrefix}${JSON.stringify(error, getCircularReplacer())}`;
	}

	private createErrorObjectWithProps(
		handler: string,
		error?: any,
		props?: ITelemetryBaseProperties,
		canRetry = true,
	): IAnyDriverError {
		return createGenericNetworkError(
			`socket.io (${handler}): ${this.getErrorMessage(error)}`,
			{ canRetry },
			{
				...props,
				driverVersion,
				details: JSON.stringify({
					...this.getConnectionDetailsProps(),
				}),
				scenarioName: handler,
			},
		);
	}

	/**
	 * Error raising for socket.io issues
	 */
	protected createErrorObject(handler: string, error?: any, canRetry = true): IAnyDriverError {
		return createGenericNetworkError(
			`socket.io (${handler}): ${this.getErrorMessage(error)}`,
			{ canRetry },
			this.getAdditionalErrorProps(handler),
		);
	}

	protected getAdditionalErrorProps(handler: string): DriverErrorTelemetryProps {
		return {
			driverVersion,
			details: JSON.stringify({
				...this.getConnectionDetailsProps(),
			}),
			scenarioName: handler,
		};
	}
}
