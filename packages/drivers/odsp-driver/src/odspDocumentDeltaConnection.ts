/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TypedEventEmitter, performanceNow } from "@fluid-internal/client-utils";
import { IEvent } from "@fluidframework/core-interfaces";
import { assert, Deferred } from "@fluidframework/core-utils/internal";
import { DocumentDeltaConnection } from "@fluidframework/driver-base/internal";
import { IClient } from "@fluidframework/driver-definitions";
import {
	IAnyDriverError,
	IConnect,
	IDocumentMessage,
	INack,
	ISentSignalMessage,
	ISequencedDocumentMessage,
	ISignalMessage,
} from "@fluidframework/driver-definitions/internal";
import { createGenericNetworkError } from "@fluidframework/driver-utils/internal";
import { OdspError } from "@fluidframework/odsp-driver-definitions/internal";
import {
	IFluidErrorBase,
	ITelemetryLoggerExt,
	loggerToMonitoringContext,
} from "@fluidframework/telemetry-utils/internal";
import { Socket } from "socket.io-client";
import { v4 as uuid } from "uuid";

import { IFlushOpsResponse, IGetOpsResponse, IOdspSocketError } from "./contracts.js";
import { EpochTracker } from "./epochTracker.js";
import { errorObjectFromSocketError } from "./odspError.js";
import { pkgVersion } from "./packageVersion.js";
import { SocketIOClientStatic } from "./socketModule.js";

const protocolVersions = ["^0.4.0", "^0.3.0", "^0.2.0", "^0.1.0"];
const feature_get_ops = "api_get_ops";
const feature_flush_ops = "api_flush_ops";

export interface FlushResult {
	lastPersistedSequenceNumber?: number;
	retryAfter?: number;
}

// How long to wait before disconnecting the socket after the last reference is removed
// This allows reconnection after receiving a nack to be smooth
const socketReferenceBufferTime = 2000;

interface ISocketEvents extends IEvent {
	(
		event: "disconnect",
		listener: (error: IFluidErrorBase & OdspError, clientId?: string) => void,
	);
}

class SocketReference extends TypedEventEmitter<ISocketEvents> {
	private references: number = 1;
	private delayDeleteTimeout: ReturnType<typeof setTimeout> | undefined;
	private _socket: Socket | undefined;

	// When making decisions about socket reuse, we do not reuse disconnected socket.
	// But we want to differentiate the following case from disconnected case:
	// Socket that never connected and never failed, it's in "attempting to connect" mode
	// such sockets should be reused, despite socket.disconnected === true
	private isPendingInitialConnection = true;

	// Map of all existing socket io sockets. [url, tenantId, documentId] -> socket
	private static readonly socketIoSockets: Map<string, SocketReference> = new Map();

	public static find(key: string, logger: ITelemetryLoggerExt): SocketReference | undefined {
		const socketReference = SocketReference.socketIoSockets.get(key);

		// Verify the socket is healthy before reusing it
		if (socketReference?.disconnected) {
			// The socket is in a bad state. fully remove the reference
			socketReference.closeSocket();
			return undefined;
		}

		if (socketReference) {
			// Clear the pending deletion if there is one
			socketReference.clearTimer();
			socketReference.references++;
		}

		return socketReference;
	}

	/**
	 * Removes a reference for the given key
	 * Once the ref count hits 0, the socket is disconnected and removed
	 */
	public removeSocketIoReference(): void {
		assert(this.references > 0, 0x09f /* "No more socketIO refs to remove!" */);
		this.references--;

		// see comment in disconnected() getter
		this.isPendingInitialConnection = false;

		if (this.disconnected) {
			this.closeSocket();
			return;
		}

		if (this.references === 0 && this.delayDeleteTimeout === undefined) {
			this.delayDeleteTimeout = setTimeout(() => {
				// We should not get here with active users.
				assert(this.references === 0, 0x0a0 /* "Unexpected socketIO references on timeout" */);
				this.closeSocket();
			}, socketReferenceBufferTime);
		}
	}

	public get socket(): Socket {
		if (!this._socket) {
			throw new Error(`Invalid socket for key "${this.key}`);
		}
		return this._socket;
	}

	public constructor(
		public readonly key: string,
		socket: Socket,
	) {
		super();

		this._socket = socket;
		assert(!SocketReference.socketIoSockets.has(key), 0x220 /* "socket key collision" */);
		SocketReference.socketIoSockets.set(key, this);

		// Server sends this event when it wants to disconnect a particular client in which case the client id would
		// be present or if it wants to disconnect all the clients. The server always closes the socket in case all
		// clients needs to be disconnected. So fully remove the socket reference in this case.
		socket.on("server_disconnect", this.serverDisconnectEventHandler);
	}

	private readonly serverDisconnectEventHandler = (
		socketError: IOdspSocketError,
		clientId?: string,
	): void => {
		// Treat all errors as recoverable, and rely on joinSession / reconnection flow to
		// filter out retryable vs. non-retryable cases.
		const error = errorObjectFromSocketError(socketError, "server_disconnect");
		error.addTelemetryProperties({ disconnectClientId: clientId });
		error.canRetry = true;

		// see comment in disconnected() getter
		// Setting it here to ensure socket reuse does not happen if new request to connect
		// comes in from "disconnect" listener below, before we close socket.
		this.isPendingInitialConnection = false;

		if (clientId === undefined) {
			// We could first raise "disconnect" event, but that may result in socket reuse due to
			// new connection comming in. So, it's better to have more explicit flow to make it impossible.
			this.closeSocket(error);
		} else {
			this.emit("disconnect", error, clientId);
		}
	};

	private clearTimer(): void {
		if (this.delayDeleteTimeout !== undefined) {
			clearTimeout(this.delayDeleteTimeout);
			this.delayDeleteTimeout = undefined;
		}
	}

	public closeSocket(error?: IAnyDriverError): void {
		if (!this._socket) {
			return;
		}

		this._socket.off("server_disconnect", this.serverDisconnectEventHandler);
		this.clearTimer();

		assert(
			SocketReference.socketIoSockets.get(this.key) === this,
			0x0a1 /* "Socket reference set unexpectedly does not point to this socket!" */,
		);

		// First, remove socket to ensure no socket reuse is possible.
		SocketReference.socketIoSockets.delete(this.key);

		// Block access to socket. From now on, calls like flush() or requestOps()
		// Disconnect flow should be synchronous and result in system fully forgetting about this connection / socket.
		const socket = this._socket;
		this._socket = undefined;

		// Let all connections know they need to go through disconnect flow.
		this.emit(
			"disconnect",
			error ??
				createGenericNetworkError(
					"Socket closed without error",
					{ canRetry: true },
					{ driverVersion: pkgVersion },
				),
			undefined /* clientId */,
		);

		// We should not have any users now, assuming synchronous disconnect flow in response to
		// "disconnect" event
		assert(
			this.references === 0,
			0x412 /* Nobody should be connected to this socket at this point! */,
		);

		socket.disconnect();
	}

	public get disconnected(): boolean {
		if (this._socket === undefined) {
			return true;
		}
		if (this.socket.connected) {
			return false;
		}

		// We have a socket that is not connected. Possible cases:
		// 1) It was connected some time ago and lost connection. We do not want to reuse it.
		// 2) It failed to connect (was never connected).
		// 3) It was just created and never had a chance to connect - connection is in process.
		// We have to differentiate 1 from 2-3 (specifically 1 & 3) in order to be able to reuse socket in #3.
		// We will use the fact that socket had some activity. I.e. if socket disconnected, or client stopped using
		// socket, then removeSocketIoReference() will be called for it, and it will be the indiction that it's not #3.
		return !this.isPendingInitialConnection;
	}
}

/**
 * Represents a connection to a stream of delta updates
 */
export class OdspDocumentDeltaConnection extends DocumentDeltaConnection {
	/**
	 * Create a OdspDocumentDeltaConnection
	 * If url #1 fails to connect, will try url #2 if applicable.
	 *
	 * @param tenantId - the ID of the tenant
	 * @param documentId - document ID
	 * @param token - authorization token for storage service
	 * @param client - information about the client
	 * @param mode - mode of the client
	 * @param url - websocket URL
	 * @param telemetryLogger - optional telemetry logger
	 * @param timeoutMs - time limit on making the connection
	 * @param epochTracker - track epoch changes
	 * @param socketReferenceKeyPrefix - (optional) prefix to isolate socket reuse cache
	 */
	public static async create(
		tenantId: string,
		documentId: string,
		// eslint-disable-next-line @rushstack/no-new-null
		token: string | null,
		client: IClient,
		url: string,
		telemetryLogger: ITelemetryLoggerExt,
		timeoutMs: number,
		epochTracker: EpochTracker,
		socketReferenceKeyPrefix: string | undefined,
	): Promise<OdspDocumentDeltaConnection> {
		const mc = loggerToMonitoringContext(telemetryLogger);

		// enable multiplexing when the websocket url does not include the tenant/document id
		const parsedUrl = new URL(url);
		const enableMultiplexing =
			!parsedUrl.searchParams.has("documentId") && !parsedUrl.searchParams.has("tenantId");

		// do not include the specific tenant/doc id in the ref key when multiplexing
		// this will allow multiple documents to share the same websocket connection
		const key = socketReferenceKeyPrefix ? `${socketReferenceKeyPrefix},${url}` : url;
		const socketReferenceKey = enableMultiplexing ? key : `${key},${tenantId},${documentId}`;

		const socketReference = OdspDocumentDeltaConnection.getOrCreateSocketIoReference(
			timeoutMs,
			socketReferenceKey,
			url,
			enableMultiplexing,
			tenantId,
			documentId,
			telemetryLogger,
		);

		const socket = socketReference.socket;
		const connectionId = uuid();
		const connectMessage: IConnect = {
			client,
			id: documentId,
			mode: client.mode,
			tenantId,
			token, // Token is going to indicate tenant level information, etc...
			versions: protocolVersions,
			driverVersion: pkgVersion,
			nonce: connectionId,
			epoch: epochTracker.fluidEpoch,
			relayUserAgent: [client.details.environment, ` driverVersion:${pkgVersion}`].join(";"),
		};

		connectMessage.supportedFeatures = {};

		// Reference to this client supporting get_ops flow.
		if (mc.config.getBoolean("Fluid.Driver.Odsp.GetOpsEnabled") !== false) {
			connectMessage.supportedFeatures[feature_get_ops] = true;
		}

		const deltaConnection = new OdspDocumentDeltaConnection(
			socket,
			documentId,
			socketReference,
			telemetryLogger,
			enableMultiplexing,
			connectionId,
		);

		try {
			await deltaConnection.initialize(connectMessage, timeoutMs);
			await epochTracker.validateEpoch(deltaConnection.details.epoch, "push");
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} catch (error: any) {
			if (error !== null && typeof error === "object") {
				// We have to special-case error types here in terms of what is re-triable.
				// These errors have to re-retried, we just need new joinSession result to connect to right server:
				//    400: Invalid tenant or document id. The WebSocket is connected to a different document
				//         Document is full (with retryAfter)
				//    404: Invalid document. The document \"local/w1-...\" does not exist
				// But this has to stay not-retriable:
				//    406: Unsupported client protocol. This path is the only gatekeeper, have to fail!
				//    409: Epoch Version Mismatch. Client epoch and server epoch does not match, so app needs
				//         to be refreshed.
				// This one is fine either way
				//    401/403: Code will retry once with new token either way, then it becomes fatal - on this path
				//         and on join Session path.
				//    501: (Fluid not enabled): this is fine either way, as joinSession is gatekeeper
				// eslint-disable-next-line unicorn/no-lonely-if, @typescript-eslint/no-unsafe-member-access
				if (error.statusCode === 400 || error.statusCode === 404) {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
					error.canRetry = true;
				}
			}
			throw error;
		}

		return deltaConnection;
	}

	private socketReference: SocketReference | undefined;

	private readonly requestOpsNoncePrefix: string;
	private pushCallCounter = 0;
	private readonly getOpsMap: Map<string, { start: number; from: number; to: number }> =
		new Map();
	private flushOpNonce: string | undefined;
	private flushDeferred: Deferred<FlushResult> | undefined;
	private connectionNotYetDisposedTimeout: ReturnType<typeof setTimeout> | undefined;
	// Due to socket reuse(multiplexing), we can get "disconnect" event from other clients in the socket reference.
	// So, a race condition could happen, where this client is establishing connection and listening for "connect_document_success"
	// on the socket among other events, but we get "disconnect" event on the socket reference from other clients, in which case,
	// we dispose connection object and stop listening to further events on the socket. Due to this we get stuck as the connection
	// is not yet established and so we don't return any connection object to the client(connection manager). So, we remain stuck.
	// In order to handle this, we use this deferred promise to keep track of connection initialization and reject this promise with
	// error in the disconnectCore so that the caller can know and handle the error.
	private connectionInitializeDeferredP: Deferred<void> | undefined;

	/**
	 * Error raising for socket.io issues
	 */
	protected createErrorObject(
		handler: string,
		// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-explicit-any
		error?: any,
		canRetry = true,
	): IAnyDriverError {
		// Note: we suspect the incoming error object is either:
		// - a socketError: add it to the OdspError object for driver to be able to parse it and reason over it.
		// - anything else: let base class handle it
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		return canRetry && Number.isInteger(error?.code) && typeof error?.message === "string"
			? errorObjectFromSocketError(error as IOdspSocketError, handler)
			: super.createErrorObject(handler, error, canRetry);
	}

	/**
	 * Gets or create a socket io connection for the given key
	 */
	private static getOrCreateSocketIoReference(
		timeoutMs: number,
		key: string,
		url: string,
		enableMultiplexing: boolean,
		tenantId: string,
		documentId: string,
		logger: ITelemetryLoggerExt,
	): SocketReference {
		// eslint-disable-next-line unicorn/no-array-callback-reference, unicorn/no-array-method-this-argument
		const existingSocketReference = SocketReference.find(key, logger);
		if (existingSocketReference) {
			return existingSocketReference;
		}

		const query = enableMultiplexing ? undefined : { documentId, tenantId };

		const socket = SocketIOClientStatic(url, {
			multiplex: false, // Don't rely on socket.io built-in multiplexing
			query,
			reconnection: false,
			transports: ["websocket"],
			timeout: timeoutMs,
		});

		return new SocketReference(key, socket);
	}

	/**
	 * @param socket - websocket to be used
	 * @param documentId - ID of the document
	 * @param details - details of the websocket connection
	 * @param socketReferenceKey - socket reference key
	 * @param enableMultiplexing - If the websocket is multiplexing multiple documents
	 */
	private constructor(
		socket: Socket,
		documentId: string,
		socketReference: SocketReference,
		logger: ITelemetryLoggerExt,
		private readonly enableMultiplexing?: boolean,
		connectionId?: string,
	) {
		super(socket, documentId, logger, false, connectionId);
		this.socketReference = socketReference;
		this.requestOpsNoncePrefix = `${uuid()}-`;
	}

	/**
	 * Retrieves ops from PUSH
	 * @param from - inclusive
	 * @param to - exclusive
	 * @returns ops retrieved
	 */
	public requestOps(from: number, to: number): void {
		assert(!this.socketReference?.disconnected, 0x413 /* non-active socket */);

		// Given that to is exclusive, we should be asking for at least something!
		assert(to > from, 0x272 /* "empty request" */);

		// PUSH may disable this functionality
		// back-compat: remove cast to any once latest version of IConnected is consumed
		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
		if ((this.details as any).supportedFeatures?.[feature_get_ops] !== true) {
			return;
		}

		this.pushCallCounter++;
		const nonce = `${this.requestOpsNoncePrefix}${this.pushCallCounter}`;
		const start = performanceNow();

		// We may keep keep accumulating memory for nothing, if we are not getting responses.
		// Note that we should not have overlapping requests, as DeltaManager allows only one
		// outstanding request to storage, and that's the only way to get here.
		// But requests could be cancelled, and thus overlapping requests might be in the picture
		// If it happens, we do not care about stale requests.
		// So track some number of requests, but log if we get too many in flight - that likely
		// indicates an error somewhere.
		if (this.getOpsMap.size >= 5) {
			let time = start;
			let key: string | undefined;
			for (const [keyCandidate, value] of this.getOpsMap.entries()) {
				if (value.start <= time || key === undefined) {
					time = value.start;
					key = keyCandidate;
				}
			}
			const payloadToDelete = this.getOpsMap.get(key!)!;
			this.logger.sendErrorEvent({
				eventName: "GetOpsTooMany",
				nonce,
				from: payloadToDelete.from,
				to: payloadToDelete.to,
				length: payloadToDelete.to - payloadToDelete.from,
				duration: performanceNow() - payloadToDelete.start,
			});
			this.getOpsMap.delete(key!);
		}
		this.getOpsMap.set(nonce, {
			start,
			from,
			to,
		});
		this.socket.emit("get_ops", this.clientId, {
			nonce,
			from,
			to: to - 1,
		});
	}

	public async flush(): Promise<FlushResult> {
		assert(!this.socketReference?.disconnected, 0x414 /* non-active socket */);

		// back-compat: remove cast to any once latest version of IConnected is consumed
		// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
		if ((this.details as any).supportedFeatures?.[feature_flush_ops] !== true) {
			// Once single-commit summary is enabled end-to-end, flush support is a must!
			// The only alternative is change in design where SPO fetches ops from PUSH OR
			// summary includes required ops and SPO has some validation mechanism to ensure
			// they are not forged by client.
			// If design changes, we can reconsider it, but right now it's non-recoverable failure.
			this.logger.sendErrorEvent({ eventName: "FlushOpsNotSupported" });
			throw new Error(
				"flush() API is not supported by PUSH, required for single-commit summaries",
			);
		}

		this.pushCallCounter++;
		const nonce = `${this.requestOpsNoncePrefix}${this.pushCallCounter}`;
		// There should be only one flush ops in flight, kicked out by upload summary workflow
		// That said, it could timeout and request could be repeated, so theoretically we can
		// get overlapping requests, but it should be very rare
		if (this.flushDeferred !== undefined) {
			this.logger.sendErrorEvent({ eventName: "FlushOpsTooMany" });
			this.flushDeferred.reject(
				"process involving flush() was cancelled OR unsupported concurrency",
			);
		}
		this.socket.emit("flush_ops", this.clientId, { nonce });

		this.flushOpNonce = nonce;
		this.flushDeferred = new Deferred<FlushResult>();
		return this.flushDeferred.promise;
	}

	protected disconnectHandler = (
		error: IFluidErrorBase & OdspError,
		clientId?: string,
	): void => {
		if (clientId === undefined || clientId === this.clientId) {
			this.logger.sendTelemetryEvent(
				{
					eventName: "ServerDisconnect",
					driverVersion: pkgVersion,
					details: JSON.stringify({
						...this.getConnectionDetailsProps(),
					}),
				},
				error,
			);
			this.disconnect(error);
		}
	};

	protected async initialize(connectMessage: IConnect, timeout: number): Promise<void> {
		assert(!this.socketReference?.disconnected, 0x415 /* non-active socket */);

		if (this.enableMultiplexing) {
			// multiplex compatible early handlers
			this.earlyOpHandler = (
				messageDocumentId: string,
				msgs: ISequencedDocumentMessage[],
			): void => {
				if (this.documentId === messageDocumentId) {
					this.queuedMessages.push(...msgs);
				}
			};

			this.earlySignalHandler = (
				msg: ISignalMessage | ISignalMessage[],
				messageDocumentId?: string,
			): void => {
				if (messageDocumentId === undefined || messageDocumentId === this.documentId) {
					if (Array.isArray(msg)) {
						this.queuedSignals.push(...msg);
					} else {
						this.queuedSignals.push(msg);
					}
				}
			};
		}

		this.socketReference!.on("disconnect", this.disconnectHandler);

		this.addTrackedListener("get_ops_response", (result: IGetOpsResponse) => {
			const messages = result.messages;
			const data = this.getOpsMap.get(result.nonce);
			// Due to socket multiplexing, this client may not have asked for any data
			// If so, there it most likely does not need these ops (otherwise it already asked for them)
			// Also we may have deleted entry in this.getOpsMap due to too many requests and too slow response.
			// But not processing such result may push us into infinite loop of fast requests and dropping all responses
			if (data !== undefined || result.nonce.startsWith(this.requestOpsNoncePrefix)) {
				this.getOpsMap.delete(result.nonce);
				const common = {
					eventName: "GetOps",
					// We need nonce only to pair with GetOpsTooMany events, i.e. when record was deleted
					nonce: data === undefined ? result.nonce : undefined,
					code: result.code,
					from: data?.from,
					to: data?.to,
					duration: data === undefined ? undefined : performanceNow() - data.start,
				};
				if (messages !== undefined && messages.length > 0) {
					this.logger.sendPerformanceEvent({
						...common,
						first: messages[0].sequenceNumber,
						last: messages[messages.length - 1].sequenceNumber,
						length: messages.length,
					});
					this.emit("op", this.documentId, messages);
				} else {
					this.logger.sendPerformanceEvent({
						...common,
						length: 0,
					});
				}
			}
		});

		this.addTrackedListener("flush_ops_response", (result: IFlushOpsResponse) => {
			if (this.flushOpNonce === result.nonce) {
				const seq = result.lastPersistedSequenceNumber;
				let category: "generic" | "error" = "generic";
				if (result.lastPersistedSequenceNumber === undefined || result.code !== 200) {
					switch (result.code) {
						case 409:
						case 429: {
							category = "error";
							break;
						}
						case 204: {
							break;
						}
						default: {
							category = "error";
							break;
						}
					}
				}
				this.logger.sendTelemetryEvent({
					eventName: "FlushResult",
					code: result.code,
					sequenceNumber: seq,
					category,
				});
				this.flushDeferred!.resolve(result);
				this.flushDeferred = undefined;
				this.flushOpNonce = undefined;
			}
		});

		this.connectionInitializeDeferredP = new Deferred<void>();

		super
			.initialize(connectMessage, timeout)
			.then(() => this.connectionInitializeDeferredP?.resolve())
			.catch((error) => this.connectionInitializeDeferredP?.reject(error));

		await this.connectionInitializeDeferredP.promise.finally(() => {
			this.logger.sendTelemetryEvent({
				eventName: "ConnectionAttemptInfo",
				...this.getConnectionDetailsProps(),
			});
		});
	}

	protected addTrackedListener(event: string, listener: (...args: any[]) => void): void {
		// override some event listeners in order to support multiple documents/clients over the same websocket
		switch (event) {
			case "op": {
				// per document op handling
				super.addTrackedListener(
					event,
					(documentId: string, msgs: ISequencedDocumentMessage[]) => {
						if (!this.enableMultiplexing || this.documentId === documentId) {
							listener(documentId, msgs);
						}
					},
				);
				break;
			}

			case "signal": {
				// per document signal handling
				super.addTrackedListener(
					event,
					(msg: ISignalMessage | ISignalMessage[], documentId?: string) => {
						if (!this.enableMultiplexing) {
							listener(msg, documentId);
							return;
						}

						assert(
							documentId !== undefined,
							0xa65 /* documentId is required when multiplexing is enabled. */,
						);

						if (documentId !== this.documentId) {
							return;
						}

						const msgs = Array.isArray(msg) ? msg : [msg];

						const filteredMsgs = msgs.filter(
							(m) => !m.targetClientId || m.targetClientId === this.clientId,
						);

						if (filteredMsgs.length > 0) {
							// This ternary is needed for signal-based layer compat tests to pass,
							// specifically the layer version combination where you have an old loader and the most recent driver layer.
							// Old loader doesn't send or receive batched signals (ISignalMessage[]),
							// so only individual ISignalMessage's should be passed when there's one element for backcompat.
							listener(filteredMsgs.length === 1 ? filteredMsgs[0] : filteredMsgs, documentId);
						}
					},
				);
				break;
			}

			case "nack": {
				// per client / document nack handling
				super.addTrackedListener(event, (clientIdOrDocumentId: string, nacks: INack[]) => {
					const handle =
						clientIdOrDocumentId.length === 0 ||
						clientIdOrDocumentId === this.documentId ||
						clientIdOrDocumentId === this.clientId;
					const { code, type, message, retryAfter } = nacks[0]?.content ?? {};
					const { clientSequenceNumber, referenceSequenceNumber } = nacks[0]?.operation ?? {};
					this.logger.sendTelemetryEvent({
						eventName: "ServerNack",
						code,
						type,
						message,
						retryAfterSeconds: retryAfter,
						clientId: this.clientId,
						handle,
						clientSequenceNumber,
						referenceSequenceNumber,
						opType: nacks[0]?.operation?.type,
					});
					if (handle) {
						this.emit("nack", clientIdOrDocumentId, nacks);
					}
				});
				break;
			}

			default: {
				super.addTrackedListener(event, listener);
				break;
			}
		}
	}

	public get disposed(): boolean {
		if (!(this._disposed || this.socket.connected)) {
			// Send error event if this connection is not yet disposed after socket is disconnected for 15s.
			// eslint-disable-next-line unicorn/no-lonely-if
			if (this.connectionNotYetDisposedTimeout === undefined) {
				this.connectionNotYetDisposedTimeout = setTimeout(() => {
					if (!this._disposed) {
						this.logger.sendErrorEvent({
							eventName: "ConnectionNotYetDisposed",
							driverVersion: pkgVersion,
							details: JSON.stringify({
								...this.getConnectionDetailsProps(),
							}),
						});
					}
				}, 15000);
			}
		}
		return this._disposed;
	}

	/**
	 * Returns true in case the connection is not yet disposed and the socket is also connected. The expectation is
	 * that it will be called only after connection is fully established. i.e. there should no way to submit an op
	 * while we are connecting, as connection object is not exposed to Loader layer until connection is established.
	 */
	private get connected(): boolean {
		return !this.disposed && this.socket.connected;
	}

	protected override emitMessages(type: "submitOp", messages: IDocumentMessage[][]): void;
	protected override emitMessages(
		type: "submitSignal",
		messages: string[][] | ISentSignalMessage[],
	): void;
	protected override emitMessages(type: string, messages: unknown): void {
		// Only submit the op/signals if we are connected.
		if (this.connected) {
			this.socket.emit(type, this.clientId, messages);
		}
	}

	/**
	 * Submits a new delta operation to the server
	 * @param message - delta operation to submit
	 */
	public submit(messages: IDocumentMessage[]): void {
		this.emitMessages("submitOp", [messages]);
	}

	/**
	 * Submits a new signal to the server
	 *
	 * @param content - Content of the signal.
	 * @param targetClientId - When specified, the signal is only sent to the provided client id.
	 */
	public submitSignal(content: string, targetClientId?: string): void {
		const signal: ISentSignalMessage = {
			content,
			targetClientId,
		};

		this.emitMessages("submitSignal", [signal]);
	}

	/**
	 * Critical path where we need to also close the socket for an error.
	 * @param error - Error causing the socket to close.
	 */
	protected closeSocketCore(error: IAnyDriverError): void {
		const socket = this.socketReference;
		assert(socket !== undefined, 0x416 /* reentrancy not supported in close socket */);
		socket.closeSocket(error);
		assert(
			this.socketReference === undefined,
			0x417 /* disconnect flow did not work correctly */,
		);
	}

	/**
	 * Disconnect from the websocket
	 */
	protected disconnectCore(err: IAnyDriverError): void {
		const socket = this.socketReference;
		assert(socket !== undefined, 0x0a2 /* "reentrancy not supported!" */);
		this.socketReference = undefined;

		socket.off("disconnect", this.disconnectHandler);
		if (this.hasDetails) {
			// tell the server we are disconnecting this client from the document
			this.socket.emit("disconnect_document", this.clientId, this.documentId);
		}

		socket.removeSocketIoReference();
		if (
			this.connectionInitializeDeferredP !== undefined &&
			!this.connectionInitializeDeferredP.isCompleted
		) {
			this.connectionInitializeDeferredP.reject(err);
		}
	}
}
