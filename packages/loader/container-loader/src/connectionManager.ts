/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IDisposable, ITelemetryBaseProperties, LogLevel } from "@fluidframework/core-interfaces";
import { assert } from "@fluidframework/core-utils";
import { performance, TypedEventEmitter } from "@fluid-internal/client-utils";
import {
	ICriticalContainerError,
	IDeltaQueue,
	ReadOnlyInfo,
} from "@fluidframework/container-definitions";
import {
	IAnyDriverError,
	IDocumentService,
	IDocumentDeltaConnection,
	IDocumentDeltaConnectionEvents,
	DriverErrorTypes,
} from "@fluidframework/driver-definitions";
import {
	canRetryOnError,
	createWriteError,
	createGenericNetworkError,
	getRetryDelayFromError,
	logNetworkFailure,
	isRuntimeMessage,
	calculateMaxWaitTime,
} from "@fluidframework/driver-utils";
import {
	ConnectionMode,
	IClient,
	IClientConfiguration,
	IClientDetails,
	IDocumentMessage,
	INack,
	INackContent,
	ISequencedDocumentMessage,
	ISignalClient,
	ISignalMessage,
	ITokenClaims,
	MessageType,
	ScopeType,
	ISequencedDocumentSystemMessage,
} from "@fluidframework/protocol-definitions";
import {
	formatTick,
	GenericError,
	isFluidError,
	ITelemetryLoggerExt,
	normalizeError,
	UsageError,
} from "@fluidframework/telemetry-utils";
import {
	ReconnectMode,
	IConnectionManager,
	IConnectionManagerFactoryArgs,
	IConnectionDetailsInternal,
	IConnectionStateChangeReason,
} from "./contracts.js";
import { DeltaQueue } from "./deltaQueue.js";
import { SignalType } from "./protocol.js";
import { isDeltaStreamConnectionForbiddenError } from "./utils.js";

// We double this value in first try in when we calculate time to wait for in "calculateMaxWaitTime" function.
const InitialReconnectDelayInMs = 500;
const DefaultChunkSize = 16 * 1024;

const fatalConnectErrorProp = { fatalConnectError: true };

function getNackReconnectInfo(nackContent: INackContent) {
	const message = `Nack (${nackContent.type}): ${nackContent.message}`;
	const canRetry = nackContent.code !== 403;
	const retryAfterMs =
		nackContent.retryAfter !== undefined ? nackContent.retryAfter * 1000 : undefined;
	return createGenericNetworkError(
		message,
		{ canRetry, retryAfterMs },
		{ statusCode: nackContent.code, driverVersion: undefined },
	);
}

/**
 * Implementation of IDocumentDeltaConnection that does not support submitting
 * or receiving ops. Used in storage-only mode.
 */
const clientNoDeltaStream: IClient = {
	mode: "read",
	details: { capabilities: { interactive: true } },
	permission: [],
	user: { id: "storage-only client" }, // we need some "fake" ID here.
	scopes: [],
};
const clientIdNoDeltaStream: string = "storage-only client";

class NoDeltaStream
	extends TypedEventEmitter<IDocumentDeltaConnectionEvents>
	implements IDocumentDeltaConnection, IDisposable
{
	clientId = clientIdNoDeltaStream;
	claims: ITokenClaims = {
		scopes: [ScopeType.DocRead],
	} as any;
	mode: ConnectionMode = "read";
	existing: boolean = true;
	maxMessageSize: number = 0;
	version: string = "";
	initialMessages: ISequencedDocumentMessage[] = [];
	initialSignals: ISignalMessage[] = [];
	initialClients: ISignalClient[] = [
		{ client: clientNoDeltaStream, clientId: clientIdNoDeltaStream },
	];
	serviceConfiguration: IClientConfiguration = {
		maxMessageSize: 0,
		blockSize: 0,
	};
	checkpointSequenceNumber?: number | undefined = undefined;
	/**
	 * Connection which is not connected to socket.
	 * @param storageOnlyReason - Reason on why the connection to delta stream is not allowed.
	 * @param readonlyConnectionReason - reason/error if any which lead to using NoDeltaStream.
	 */
	constructor(
		public readonly storageOnlyReason?: string,
		public readonly readonlyConnectionReason?: IConnectionStateChangeReason,
	) {
		super();
	}
	submit(messages: IDocumentMessage[]): void {
		this.emit(
			"nack",
			this.clientId,
			messages.map((operation) => {
				return {
					operation,
					content: { message: "Cannot submit with storage-only connection", code: 403 },
				};
			}),
		);
	}
	submitSignal(message: any): void {
		this.emit("nack", this.clientId, {
			operation: message,
			content: { message: "Cannot submit signal with storage-only connection", code: 403 },
		});
	}

	private _disposed = false;
	public get disposed() {
		return this._disposed;
	}
	public dispose() {
		this._disposed = true;
	}
}

function isNoDeltaStreamConnection(connection: any): connection is NoDeltaStream {
	return connection instanceof NoDeltaStream;
}

const waitForOnline = async (): Promise<void> => {
	// Only wait if we have a strong signal that we're offline - otherwise assume we're online.
	if (globalThis.navigator?.onLine === false && globalThis.addEventListener !== undefined) {
		return new Promise<void>((resolve) => {
			const resolveAndRemoveListener = () => {
				resolve();
				globalThis.removeEventListener("online", resolveAndRemoveListener);
			};
			globalThis.addEventListener("online", resolveAndRemoveListener);
		});
	}
};

/**
 * Interface to track the current in-progress connection attempt.
 */
interface IPendingConnection {
	/**
	 * Used to cancel an in-progress connection attempt.
	 */
	abort(): void;

	/**
	 * Desired ConnectionMode of this in-progress connection attempt.
	 */
	connectionMode: ConnectionMode;
}

/**
 * Implementation of IConnectionManager, used by Container class
 * Implements constant connectivity to relay service, by reconnecting in case of lost connection or error.
 * Exposes various controls to influence this process, including manual reconnects, forced read-only mode, etc.
 */
export class ConnectionManager implements IConnectionManager {
	/** Connection mode used when reconnecting on error or disconnect. */
	private readonly defaultReconnectionMode: ConnectionMode;

	/**
	 * Tracks the current in-progress connection attempt. Undefined if there is none.
	 * Note: Once the connection attempt fires and the code becomes asynchronous, its possible that a new connection
	 * attempt was fired and this.pendingConnection was overwritten to reflect the new attempt.
	 */
	private pendingConnection: IPendingConnection | undefined;
	private connection: IDocumentDeltaConnection | undefined;

	/** file ACL - whether user has only read-only access to a file */
	private _readonlyPermissions: boolean | undefined;

	/** tracks host requiring read-only mode. */
	private _forceReadonly = false;

	/**
	 * Controls whether the DeltaManager will automatically reconnect to the delta stream after receiving a disconnect.
	 */
	private _reconnectMode: ReconnectMode;

	/** True if there is pending (async) reconnection from "read" to "write" */
	private pendingReconnect = false;

	private clientSequenceNumber = 0;
	private clientSequenceNumberObserved = 0;
	/** Counts the number of non-runtime ops sent by the client which may not be acked. */
	private localOpsToIgnore = 0;

	/** track clientId used last time when we sent any ops */
	private lastSubmittedClientId: string | undefined;

	private connectFirstConnection = true;

	private _connectionVerboseProps: Record<string, string | number> = {};

	private _connectionProps: ITelemetryBaseProperties = {};

	private _disposed = false;

	private readonly _outbound: DeltaQueue<IDocumentMessage[]>;

	public get connectionVerboseProps() {
		return this._connectionVerboseProps;
	}

	public readonly clientDetails: IClientDetails;

	/**
	 * The current connection mode, initially read.
	 */
	public get connectionMode(): ConnectionMode {
		return this.connection?.mode ?? "read";
	}

	public get connected() {
		return this.connection !== undefined;
	}

	public get clientId() {
		return this.connection?.clientId;
	}
	/**
	 * Automatic reconnecting enabled or disabled.
	 * If set to Never, then reconnecting will never be allowed.
	 */
	public get reconnectMode(): ReconnectMode {
		return this._reconnectMode;
	}

	public get maxMessageSize(): number {
		return this.connection?.serviceConfiguration?.maxMessageSize ?? DefaultChunkSize;
	}

	public get version(): string {
		if (this.connection === undefined) {
			throw new Error("Cannot check version without a connection");
		}
		return this.connection.version;
	}

	public get serviceConfiguration(): IClientConfiguration | undefined {
		return this.connection?.serviceConfiguration;
	}

	public get scopes(): string[] | undefined {
		return this.connection?.claims.scopes;
	}

	public get outbound(): IDeltaQueue<IDocumentMessage[]> {
		return this._outbound;
	}

	/**
	 * Returns set of props that can be logged in telemetry that provide some insights / statistics
	 * about current or last connection (if there is no connection at the moment)
	 */
	public get connectionProps(): ITelemetryBaseProperties {
		return this.connection !== undefined
			? this._connectionProps
			: {
					...this._connectionProps,
					// Report how many ops this client sent in last disconnected session
					sentOps: this.clientSequenceNumber,
			  };
	}

	public shouldJoinWrite(): boolean {
		// We don't have to wait for ack for topmost NoOps. So subtract those.
		const outstandingOps =
			this.clientSequenceNumberObserved < this.clientSequenceNumber - this.localOpsToIgnore;

		// Previous behavior was to force write mode here only when there are outstanding ops (besides
		// no-ops). The dirty signal from runtime should provide the same behavior, but also support
		// stashed ops that weren't submitted to container layer yet. For safety, we want to retain the
		// same behavior whenever dirty is false.
		const isDirty = this.containerDirty();
		if (outstandingOps !== isDirty) {
			this.logger.sendTelemetryEvent({
				eventName: "DesiredConnectionModeMismatch",
				details: JSON.stringify({ outstandingOps, isDirty }),
			});
		}
		return outstandingOps || isDirty;
	}

	/**
	 * Tells if container is in read-only mode.
	 * Data stores should listen for "readonly" notifications and disallow user
	 * making changes to data stores.
	 * Readonly state can be because of no storage write permission,
	 * or due to host forcing readonly mode for container.
	 * It is undefined if we have not yet established websocket connection
	 * and do not know if user has write access to a file.
	 */
	private get readonly(): boolean | undefined {
		return this.readOnlyInfo.readonly;
	}

	public get readOnlyInfo(): ReadOnlyInfo {
		let storageOnly: boolean = false;
		let storageOnlyReason: string | undefined;
		if (isNoDeltaStreamConnection(this.connection)) {
			storageOnly = true;
			storageOnlyReason = this.connection.storageOnlyReason;
		}
		if (storageOnly || this._forceReadonly || this._readonlyPermissions === true) {
			return {
				readonly: true,
				forced: this._forceReadonly,
				permissions: this._readonlyPermissions,
				storageOnly,
				storageOnlyReason,
			};
		}

		return { readonly: this._readonlyPermissions };
	}

	private static detailsFromConnection(
		connection: IDocumentDeltaConnection,
		reason: IConnectionStateChangeReason,
	): IConnectionDetailsInternal {
		return {
			claims: connection.claims,
			clientId: connection.clientId,
			checkpointSequenceNumber: connection.checkpointSequenceNumber,
			get initialClients() {
				return connection.initialClients;
			},
			mode: connection.mode,
			serviceConfiguration: connection.serviceConfiguration,
			version: connection.version,
			reason,
		};
	}

	constructor(
		private readonly serviceProvider: () => IDocumentService | undefined,
		public readonly containerDirty: () => boolean,
		private readonly client: IClient,
		reconnectAllowed: boolean,
		private readonly logger: ITelemetryLoggerExt,
		private readonly props: IConnectionManagerFactoryArgs,
	) {
		this.clientDetails = this.client.details;
		this.defaultReconnectionMode = this.client.mode;
		this._reconnectMode = reconnectAllowed ? ReconnectMode.Enabled : ReconnectMode.Never;

		// Outbound message queue. The outbound queue is represented as a queue of an array of ops. Ops contained
		// within an array *must* fit within the maxMessageSize and are guaranteed to be ordered sequentially.
		this._outbound = new DeltaQueue<IDocumentMessage[]>((messages) => {
			if (this.connection === undefined) {
				throw new Error("Attempted to submit an outbound message without connection");
			}
			this.connection.submit(messages);
		});

		this._outbound.on("error", (error) => {
			this.props.closeHandler(normalizeError(error));
		});
	}

	public dispose(error?: ICriticalContainerError, switchToReadonly: boolean = true) {
		if (this._disposed) {
			return;
		}
		this._disposed = true;

		// Ensure that things like triggerConnect() will short circuit
		this._reconnectMode = ReconnectMode.Never;

		this._outbound.clear();

		const disconnectReason: IConnectionStateChangeReason = {
			text: "Closing DeltaManager",
			error,
		};

		const oldReadonlyValue = this.readonly;
		// This raises "disconnect" event if we have active connection.
		this.disconnectFromDeltaStream(disconnectReason);

		if (switchToReadonly) {
			// Notify everyone we are in read-only state.
			// Useful for data stores in case we hit some critical error,
			// to switch to a mode where user edits are not accepted
			this.set_readonlyPermissions(true, oldReadonlyValue, disconnectReason);
		}
	}

	/**
	 * Enables or disables automatic reconnecting.
	 * Will throw an error if reconnectMode set to Never.
	 */
	public setAutoReconnect(mode: ReconnectMode, reason: IConnectionStateChangeReason): void {
		assert(
			mode !== ReconnectMode.Never && this._reconnectMode !== ReconnectMode.Never,
			0x278 /* "API is not supported for non-connecting or closed container" */,
		);

		this._reconnectMode = mode;

		if (mode !== ReconnectMode.Enabled) {
			// immediately disconnect - do not rely on service eventually dropping connection.
			this.disconnectFromDeltaStream(reason);
		}
	}

	/**
	 * {@inheritDoc Container.forceReadonly}
	 */
	public forceReadonly(readonly: boolean) {
		if (readonly !== this._forceReadonly) {
			this.logger.sendTelemetryEvent({
				eventName: "ForceReadOnly",
				value: readonly,
			});
		}
		const oldValue = this.readonly;
		this._forceReadonly = readonly;

		if (oldValue !== this.readonly) {
			if (this._reconnectMode === ReconnectMode.Never) {
				throw new UsageError("API is not supported for non-connecting or closed container");
			}
			let reconnect = false;
			if (this.readonly === true) {
				// If we switch to readonly while connected, we should disconnect first
				// See comment in the "readonly" event handler to deltaManager set up by
				// the ContainerRuntime constructor

				if (this.shouldJoinWrite()) {
					// If we have pending changes, then we will never send them - it smells like
					// host logic error.
					this.logger.sendErrorEvent({ eventName: "ForceReadonlyPendingChanged" });
				}

				reconnect = this.disconnectFromDeltaStream({ text: "Force readonly" });
			}
			this.props.readonlyChangeHandler(this.readonly);
			if (reconnect) {
				// reconnect if we disconnected from before.
				this.triggerConnect({ text: "Force Readonly" }, "read");
			}
		}
	}

	private set_readonlyPermissions(
		newReadonlyValue: boolean,
		oldReadonlyValue: boolean | undefined,
		readonlyConnectionReason?: IConnectionStateChangeReason,
	) {
		this._readonlyPermissions = newReadonlyValue;
		if (oldReadonlyValue !== this.readonly) {
			this.props.readonlyChangeHandler(this.readonly, readonlyConnectionReason);
		}
	}

	public connect(reason: IConnectionStateChangeReason, connectionMode?: ConnectionMode) {
		this.connectCore(reason, connectionMode).catch((e) => {
			const normalizedError = normalizeError(e, { props: fatalConnectErrorProp });
			this.props.closeHandler(normalizedError);
		});
	}

	private async connectCore(
		reason: IConnectionStateChangeReason,
		connectionMode?: ConnectionMode,
	): Promise<void> {
		assert(!this._disposed, 0x26a /* "not closed" */);

		if (this.connection !== undefined) {
			return; // Connection attempt already completed successfully
		}

		let pendingConnectionMode;
		if (this.pendingConnection !== undefined) {
			pendingConnectionMode = this.pendingConnection.connectionMode;
			this.cancelConnection(reason); // Throw out in-progress connection attempt in favor of new attempt
			assert(
				this.pendingConnection === undefined,
				0x344 /* this.pendingConnection should be undefined */,
			);
		}
		// If there is no specified ConnectionMode, try the previous mode, if there is no previous mode use default
		let requestedMode = connectionMode ?? pendingConnectionMode ?? this.defaultReconnectionMode;

		// if we have any non-acked ops from last connection, reconnect as "write".
		// without that we would connect in view-only mode, which will result in immediate
		// firing of "connected" event from Container and switch of current clientId (as tracked
		// by all DDSes). This will make it impossible to figure out if ops actually made it through,
		// so DDSes will immediately resubmit all pending ops, and some of them will be duplicates, corrupting document
		if (this.shouldJoinWrite()) {
			requestedMode = "write";
		}

		const docService = this.serviceProvider();
		assert(docService !== undefined, 0x2a7 /* "Container is not attached" */);

		let connection: IDocumentDeltaConnection | undefined;

		if (docService.policies?.storageOnly === true) {
			connection = new NoDeltaStream();
			this.setupNewSuccessfulConnection(connection, "read", reason);
			assert(this.pendingConnection === undefined, 0x2b3 /* "logic error" */);
			return;
		}

		let delayMs = InitialReconnectDelayInMs;
		let connectRepeatCount = 0;
		const connectStartTime = performance.now();
		let lastError: any;

		const abortController = new AbortController();
		const abortSignal = abortController.signal;
		this.pendingConnection = {
			abort: () => {
				abortController.abort();
			},
			connectionMode: requestedMode,
		};

		this.props.establishConnectionHandler(reason);
		// This loop will keep trying to connect until successful, with a delay between each iteration.
		while (connection === undefined) {
			if (this._disposed) {
				throw new Error("Attempting to connect a closed DeltaManager");
			}
			if (abortSignal.aborted === true) {
				this.logger.sendTelemetryEvent({
					eventName: "ConnectionAttemptCancelled",
					attempts: connectRepeatCount,
					duration: formatTick(performance.now() - connectStartTime),
					connectionEstablished: false,
				});
				return;
			}
			connectRepeatCount++;

			try {
				this.client.mode = requestedMode;
				connection = await docService.connectToDeltaStream({
					...this.client,
					mode: requestedMode,
				});

				if (connection.disposed) {
					// Nobody observed this connection, so drop it on the floor and retry.
					this.logger.sendTelemetryEvent({ eventName: "ReceivedClosedConnection" });
					connection = undefined;
				}
				this.logger.sendTelemetryEvent(
					{
						eventName: "ConnectionReceived",
						connected: connection !== undefined && connection.disposed === false,
					},
					undefined,
					LogLevel.verbose,
				);
			} catch (origError: any) {
				this.logger.sendTelemetryEvent(
					{
						eventName: "ConnectToDeltaStreamException",
						connected: connection !== undefined && connection.disposed === false,
					},
					undefined,
					LogLevel.verbose,
				);
				if (isDeltaStreamConnectionForbiddenError(origError)) {
					connection = new NoDeltaStream(origError.storageOnlyReason, {
						text: origError.message,
						error: origError,
					});
					requestedMode = "read";
					break;
				} else if (
					isFluidError(origError) &&
					origError.errorType === DriverErrorTypes.outOfStorageError
				) {
					// If we get out of storage error from calling joinsession, then use the NoDeltaStream object so
					// that user can at least load the container.
					connection = new NoDeltaStream(undefined, {
						text: origError.message,
						error: origError,
					});
					requestedMode = "read";
					break;
				}

				// Socket.io error when we connect to wrong socket, or hit some multiplexing bug
				if (!canRetryOnError(origError)) {
					const error = normalizeError(origError, { props: fatalConnectErrorProp });
					this.props.closeHandler(error);
					throw error;
				}

				// Since the error is retryable this will not log to the error table
				logNetworkFailure(
					this.logger,
					{
						attempts: connectRepeatCount,
						delay: delayMs, // milliseconds
						eventName: "DeltaConnectionFailureToConnect",
						duration: formatTick(performance.now() - connectStartTime),
					},
					origError,
				);

				lastError = origError;

				const waitStartTime = performance.now();
				const retryDelayFromError = getRetryDelayFromError(origError);
				// If the error told us to wait or browser signals us that we are offline, then calculate the time we
				// want to wait for before retrying. then we wait for that time. If the error didn't tell us to wait,
				// let's still wait a little bit before retrying. We can skip this delay if we're confident we're offline,
				// because we probably just need to wait to come back online. But we never have strong signal of being
				// offline, so we at least wait for sometime.
				if (retryDelayFromError !== undefined || globalThis.navigator?.onLine !== false) {
					delayMs = calculateMaxWaitTime(delayMs, origError);
				}

				// Raise event in case the delay was there from the error.
				if (retryDelayFromError !== undefined) {
					this.props.reconnectionDelayHandler(delayMs, origError);
				}

				await new Promise<void>((resolve) => {
					setTimeout(resolve, delayMs);
				});

				// If we believe we're offline, we assume there's no point in trying until we at least think we're online.
				// NOTE: This isn't strictly true for drivers that don't require network (e.g. local driver).  Really this logic
				// should probably live in the driver.
				await waitForOnline();
				this.logger.sendPerformanceEvent({
					eventName: "WaitBetweenConnectionAttempts",
					duration: performance.now() - waitStartTime,
					details: JSON.stringify({
						retryDelayFromError,
						delayMs,
					}),
				});
			}
		}

		// If we retried more than once, log an event about how long it took (this will not log to error table)
		if (connectRepeatCount > 1) {
			logNetworkFailure(
				this.logger,
				{
					eventName: "MultipleDeltaConnectionFailures",
					attempts: connectRepeatCount,
					duration: formatTick(performance.now() - connectStartTime),
				},
				lastError,
			);
		}

		// Check for abort signal after while loop as well or we've been disposed
		if (abortSignal.aborted === true || this._disposed) {
			connection.dispose();
			this.logger.sendTelemetryEvent({
				eventName: "ConnectionAttemptCancelled",
				attempts: connectRepeatCount,
				duration: formatTick(performance.now() - connectStartTime),
				connectionEstablished: true,
			});
			return;
		}

		this.setupNewSuccessfulConnection(connection, requestedMode, reason);
	}

	/**
	 * Start the connection. Any error should result in container being closed.
	 * And report the error if it escapes for any reason.
	 * @param args - The connection arguments
	 */
	private triggerConnect(reason: IConnectionStateChangeReason, connectionMode: ConnectionMode) {
		// reconnect() includes async awaits, and that causes potential race conditions
		// where we might already have a connection. If it were to happen, it's possible that we will connect
		// with different mode to `connectionMode`. Glancing through the caller chains, it looks like code should be
		// fine (if needed, reconnect flow will get triggered again). Places where new mode matters should encode it
		// directly in connectCore - see this.shouldJoinWrite() test as an example.
		// assert(this.connection === undefined, 0x239 /* "called only in disconnected state" */);

		if (this.reconnectMode !== ReconnectMode.Enabled) {
			return;
		}
		this.connect(reason, connectionMode);
	}

	/**
	 * Disconnect the current connection.
	 * @param reason - Text description of disconnect reason to emit with disconnect event
	 * @param error - Error causing the disconnect if any.
	 * @returns A boolean that indicates if there was an existing connection (or pending connection) to disconnect
	 */
	private disconnectFromDeltaStream(reason: IConnectionStateChangeReason): boolean {
		this.pendingReconnect = false;

		if (this.connection === undefined) {
			if (this.pendingConnection !== undefined) {
				this.cancelConnection(reason);
				return true;
			}
			return false;
		}

		assert(
			this.pendingConnection === undefined,
			0x27b /* "reentrancy may result in incorrect behavior" */,
		);

		const connection = this.connection;
		// Avoid any re-entrancy - clear object reference
		this.connection = undefined;

		// Remove listeners first so we don't try to retrigger this flow accidentally through reconnectOnError
		connection.off("op", this.opHandler);
		connection.off("signal", this.signalHandler);
		connection.off("nack", this.nackHandler);
		connection.off("disconnect", this.disconnectHandlerInternal);
		connection.off("error", this.errorHandler);
		connection.off("pong", this.props.pongHandler);

		// eslint-disable-next-line @typescript-eslint/no-floating-promises
		this._outbound.pause();
		this._outbound.clear();
		connection.dispose();

		this.props.disconnectHandler(reason);

		this._connectionVerboseProps = {};

		return true;
	}

	/**
	 * Cancel in-progress connection attempt.
	 */
	private cancelConnection(reason: IConnectionStateChangeReason) {
		assert(
			this.pendingConnection !== undefined,
			0x345 /* this.pendingConnection is undefined when trying to cancel */,
		);
		this.pendingConnection.abort();
		this.pendingConnection = undefined;
		this.logger.sendTelemetryEvent({ eventName: "ConnectionCancelReceived" });
		this.props.cancelConnectionHandler({
			text: `Cancel Pending Connection due to ${reason.text}`,
			error: reason.error,
		});
	}

	/**
	 * Once we've successfully gotten a connection, we need to set up state, attach event listeners, and process
	 * initial messages.
	 * @param connection - The newly established connection
	 */
	private setupNewSuccessfulConnection(
		connection: IDocumentDeltaConnection,
		requestedMode: ConnectionMode,
		reason: IConnectionStateChangeReason,
	) {
		// Old connection should have been cleaned up before establishing a new one
		assert(
			this.connection === undefined,
			0x0e6 /* "old connection exists on new connection setup" */,
		);
		assert(
			!connection.disposed,
			0x28a /* "can't be disposed - Callers need to ensure that!" */,
		);

		this.pendingConnection = undefined;

		const oldReadonlyValue = this.readonly;
		this.connection = connection;

		// Does information in scopes & mode matches?
		// If we asked for "write" and got "read", then file is read-only
		// But if we ask read, server can still give us write.
		const readonly = !connection.claims.scopes.includes(ScopeType.DocWrite);

		if (connection.mode !== requestedMode) {
			this.logger.sendTelemetryEvent({
				eventName: "ConnectionModeMismatch",
				requestedMode,
				mode: connection.mode,
			});
		}
		// This connection mode validation logic is moving to the driver layer in 0.44.  These two asserts can be
		// removed after those packages have released and become ubiquitous.
		assert(
			requestedMode === "read" || readonly === (this.connectionMode === "read"),
			0x0e7 /* "claims/connectionMode mismatch" */,
		);
		assert(
			!readonly || this.connectionMode === "read",
			0x0e8 /* "readonly perf with write connection" */,
		);

		this.set_readonlyPermissions(
			readonly,
			oldReadonlyValue,
			isNoDeltaStreamConnection(connection) ? connection.readonlyConnectionReason : undefined,
		);

		if (this._disposed) {
			// Raise proper events, Log telemetry event and close connection.
			this.disconnectFromDeltaStream({ text: "ConnectionManager already closed" });
			return;
		}

		this._outbound.resume();

		connection.on("op", this.opHandler);
		connection.on("signal", this.signalHandler);
		connection.on("nack", this.nackHandler);
		connection.on("disconnect", this.disconnectHandlerInternal);
		connection.on("error", this.errorHandler);
		connection.on("pong", this.props.pongHandler);

		// Initial messages are always sorted. However, due to early op handler installed by drivers and appending those
		// ops to initialMessages, resulting set is no longer sorted, which would result in client hitting storage to
		// fill in gap. We will recover by cancelling this request once we process remaining ops, but it's a waste that
		// we could avoid
		const initialMessages = connection.initialMessages.sort(
			(a, b) => a.sequenceNumber - b.sequenceNumber,
		);

		// Some storages may provide checkpointSequenceNumber to identify how far client is behind.
		let checkpointSequenceNumber = connection.checkpointSequenceNumber;

		this._connectionVerboseProps = {
			clientId: connection.clientId,
			mode: connection.mode,
		};

		// reset connection props
		this._connectionProps = {};

		if (connection.relayServiceAgent !== undefined) {
			this._connectionVerboseProps.relayServiceAgent = connection.relayServiceAgent;
			this._connectionProps.relayServiceAgent = connection.relayServiceAgent;
		}
		this._connectionProps.socketDocumentId = connection.claims.documentId;
		this._connectionProps.connectionMode = connection.mode;

		let last = -1;
		if (initialMessages.length !== 0) {
			this._connectionVerboseProps.connectionInitialOpsFrom =
				initialMessages[0].sequenceNumber;
			last = initialMessages[initialMessages.length - 1].sequenceNumber;
			this._connectionVerboseProps.connectionInitialOpsTo = last + 1;
			// Update knowledge of how far we are behind, before raising "connect" event
			// This is duplication of what incomingOpHandler() does, but we have to raise event before we get there,
			// so duplicating update logic here as well.
			if (checkpointSequenceNumber === undefined || checkpointSequenceNumber < last) {
				checkpointSequenceNumber = last;
			}
		}

		this.props.incomingOpHandler(
			initialMessages,
			this.connectFirstConnection ? "InitialOps" : "ReconnectOps",
		);

		const details = ConnectionManager.detailsFromConnection(connection, reason);
		details.checkpointSequenceNumber = checkpointSequenceNumber;
		this.props.connectHandler(details);

		this.connectFirstConnection = false;

		// Synthesize clear & join signals out of initialClients state.
		// This allows us to have single way to process signals, and makes it simpler to initialize
		// protocol in Container.
		const clearSignal: ISignalMessage = {
			clientId: null, // system message
			content: JSON.stringify({
				type: SignalType.Clear,
			}),
		};

		// list of signals to process due to this new connection
		let signalsToProcess: ISignalMessage[] = [clearSignal];

		const clientJoinSignals: ISignalMessage[] = (connection.initialClients ?? []).map(
			(priorClient) => ({
				clientId: null, // system signal
				content: JSON.stringify({
					type: SignalType.ClientJoin,
					content: priorClient, // ISignalClient
				}),
			}),
		);
		if (clientJoinSignals.length > 0) {
			signalsToProcess = signalsToProcess.concat(clientJoinSignals);
		}

		// Unfortunately, there is no defined order between initialSignals (including join & leave signals)
		// and connection.initialClients. In practice, connection.initialSignals quite often contains join signal
		// for "self" and connection.initialClients does not contain "self", so we have to process them after
		// "clear" signal above.
		if (connection.initialSignals !== undefined && connection.initialSignals.length > 0) {
			signalsToProcess = signalsToProcess.concat(connection.initialSignals);
		}

		this.props.signalHandler(signalsToProcess);
	}

	/**
	 * Disconnect the current connection and reconnect. Closes the container if it fails.
	 * @param connection - The connection that wants to reconnect - no-op if it's different from this.connection
	 * @param requestedMode - Read or write
	 * @param error - Error reconnect information including whether or not to reconnect
	 * @returns A promise that resolves when the connection is reestablished or we stop trying
	 */
	private reconnectOnError(requestedMode: ConnectionMode, error: IAnyDriverError) {
		this.reconnect(requestedMode, { text: error.message, error }).catch(
			this.props.closeHandler,
		);
	}

	/**
	 * Disconnect the current connection and reconnect.
	 * @param connection - The connection that wants to reconnect - no-op if it's different from this.connection
	 * @param requestedMode - Read or write
	 * @param error - Error reconnect information including whether or not to reconnect
	 * @returns A promise that resolves when the connection is reestablished or we stop trying
	 */
	private async reconnect(
		requestedMode: ConnectionMode,
		reason: IConnectionStateChangeReason<IAnyDriverError>,
	) {
		// We quite often get protocol errors before / after observing nack/disconnect
		// we do not want to run through same sequence twice.
		// If we're already disconnected/disconnecting it's not appropriate to call this again.
		assert(this.connection !== undefined, 0x0eb /* "Missing connection for reconnect" */);

		this.disconnectFromDeltaStream(reason);

		// We will always trigger reconnect, even if canRetry is false.
		// Any truly fatal error state will result in container close upon attempted reconnect,
		// which is a preferable to closing abruptly when a live connection fails.
		if (reason.error?.canRetry === false) {
			this.logger.sendTelemetryEvent(
				{
					eventName: "reconnectingDespiteFatalError",
					reconnectMode: this.reconnectMode,
				},
				reason.error,
			);
		}

		if (this.reconnectMode === ReconnectMode.Never) {
			// Do not raise container error if we are closing just because we lost connection.
			// Those errors (like IdleDisconnect) would show up in telemetry dashboards and
			// are very misleading, as first initial reaction - some logic is broken.
			this.props.closeHandler();
		}

		// If closed then we can't reconnect
		if (this._disposed || this.reconnectMode !== ReconnectMode.Enabled) {
			return;
		}

		// If the error tells us to wait before retrying, then do so.
		const delayMs = getRetryDelayFromError(reason.error);
		if (reason.error !== undefined && delayMs !== undefined) {
			this.props.reconnectionDelayHandler(delayMs, reason.error);
			await new Promise<void>((resolve) => {
				setTimeout(resolve, delayMs);
			});
		}

		// If we believe we're offline, we assume there's no point in trying again until we at least think we're online.
		// NOTE: This isn't strictly true for drivers that don't require network (e.g. local driver).  Really this logic
		// should probably live in the driver.
		await waitForOnline();

		this.triggerConnect(
			{
				text:
					reason.error !== undefined
						? "Reconnecting due to Error"
						: `Reconnecting due to: ${reason.text}`,
				error: reason.error,
			},
			requestedMode,
		);
	}

	public prepareMessageToSend(
		message: Omit<IDocumentMessage, "clientSequenceNumber">,
	): IDocumentMessage | undefined {
		if (this.readonly === true) {
			assert(
				this.readOnlyInfo.readonly === true,
				0x1f0 /* "Unexpected mismatch in readonly" */,
			);
			const error = new GenericError("deltaManagerReadonlySubmit", undefined /* error */, {
				readonly: this.readOnlyInfo.readonly,
				forcedReadonly: this.readOnlyInfo.forced,
				readonlyPermissions: this.readOnlyInfo.permissions,
				storageOnly: this.readOnlyInfo.storageOnly,
				storageOnlyReason: this.readOnlyInfo.storageOnlyReason,
			});
			this.props.closeHandler(error);
			return undefined;
		}

		// reset clientSequenceNumber if we are using new clientId.
		// we keep info about old connection as long as possible to be able to account for all non-acked ops
		// that we pick up on next connection.
		assert(!!this.connection, 0x0e4 /* "Lost old connection!" */);
		if (this.lastSubmittedClientId !== this.connection?.clientId) {
			this.lastSubmittedClientId = this.connection?.clientId;
			this.clientSequenceNumber = 0;
			this.clientSequenceNumberObserved = 0;
		}

		if (!isRuntimeMessage(message)) {
			this.localOpsToIgnore++;
		} else {
			this.localOpsToIgnore = 0;
		}

		return {
			...message,
			clientSequenceNumber: ++this.clientSequenceNumber,
		};
	}

	public submitSignal(content: any, targetClientId?: string) {
		if (this.connection !== undefined) {
			this.connection.submitSignal(content, targetClientId);
		} else {
			this.logger.sendErrorEvent({ eventName: "submitSignalDisconnected" });
		}
	}

	public sendMessages(messages: IDocumentMessage[]) {
		assert(this.connected, 0x2b4 /* "not connected on sending ops!" */);
		// If connection is "read" or implicit "read" (got leave op for "write" connection),
		// then op can't make it through - we will get a nack if op is sent.
		// We can short-circuit this process.
		// Note that we also want nacks to be rare and be treated as catastrophic failures.
		// Be careful with reentrancy though - disconnected event should not be be raised in the
		// middle of the current workflow, but rather on clean stack!
		if (this.connectionMode === "read") {
			if (!this.pendingReconnect) {
				this.pendingReconnect = true;
				Promise.resolve()
					.then(async () => {
						if (this.pendingReconnect) {
							// still valid?
							await this.reconnect(
								"write", // connectionMode
								{ text: "Switch to write" }, // message
							);
						}
					})
					.catch(() => {});
			}
			return;
		}

		assert(!this.pendingReconnect, 0x2b5 /* "logic error" */);

		this._outbound.push(messages);
	}

	public beforeProcessingIncomingOp(message: ISequencedDocumentMessage) {
		// if we have connection, and message is local, then we better treat is as local!
		assert(
			this.clientId !== message.clientId || this.lastSubmittedClientId === message.clientId,
			0x0ee /* "Not accounting local messages correctly" */,
		);

		if (
			this.lastSubmittedClientId !== undefined &&
			this.lastSubmittedClientId === message.clientId
		) {
			const clientSequenceNumber = message.clientSequenceNumber;

			assert(
				this.clientSequenceNumberObserved < clientSequenceNumber,
				0x0ef /* "client seq# not growing" */,
			);
			assert(
				clientSequenceNumber <= this.clientSequenceNumber,
				0x0f0 /* "Incoming local client seq# > generated by this client" */,
			);

			this.clientSequenceNumberObserved = clientSequenceNumber;
		}

		if (message.type === MessageType.ClientLeave) {
			const systemLeaveMessage = message as ISequencedDocumentSystemMessage;
			const clientId = JSON.parse(systemLeaveMessage.data) as string;
			if (clientId === this.clientId) {
				// We have been kicked out from quorum
				this.logger.sendPerformanceEvent({ eventName: "ReadConnectionTransition" });

				// Please see #8483 for more details on why maintaining connection further as is would not work.
				// Short story - connection properties are immutable, and many processes (consensus DDSes, summarizer)
				// assume that connection stays "write" connection until disconnect, and act accordingly, which may
				// not work well with de-facto "read" connection we are in after receiving own leave op on timeout.
				// Clients need to be able to transition to "read" state after some time of inactivity!
				// Note - this may close container!
				this.reconnect(
					"read", // connectionMode
					{ text: "Switch to read" }, // message
				).catch((error) => {
					this.logger.sendErrorEvent({ eventName: "SwitchToReadConnection" }, error);
				});
			}
		}
	}

	private readonly opHandler = (documentId: string, messagesArg: ISequencedDocumentMessage[]) => {
		const messages = Array.isArray(messagesArg) ? messagesArg : [messagesArg];
		this.props.incomingOpHandler(messages, "opHandler");
	};

	private readonly signalHandler = (signalsArg: ISignalMessage | ISignalMessage[]) => {
		const signals = Array.isArray(signalsArg) ? signalsArg : [signalsArg];
		this.props.signalHandler(signals);
	};

	// Always connect in write mode after getting nacked.
	private readonly nackHandler = (documentId: string, messages: INack[]) => {
		const message = messages[0];
		if (this._readonlyPermissions === true) {
			this.props.closeHandler(
				createWriteError("writeOnReadOnlyDocument", { driverVersion: undefined }),
			);
			return;
		}

		const reconnectInfo = getNackReconnectInfo(message.content);

		// If the nack indicates we cannot retry, then close the container outright
		if (!reconnectInfo.canRetry) {
			this.props.closeHandler(reconnectInfo);
			return;
		}

		this.reconnectOnError("write", reconnectInfo);
	};

	// Connection mode is always read on disconnect/error unless the system mode was write.
	private readonly disconnectHandlerInternal = (disconnectReason: IAnyDriverError) => {
		// Note: we might get multiple disconnect calls on same socket, as early disconnect notification
		// ("server_disconnect", ODSP-specific) is mapped to "disconnect"
		this.reconnectOnError(this.defaultReconnectionMode, disconnectReason);
	};

	private readonly errorHandler = (error: IAnyDriverError) => {
		this.reconnectOnError(this.defaultReconnectionMode, error);
	};
}
