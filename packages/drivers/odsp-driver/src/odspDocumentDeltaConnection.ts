/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger, IEvent } from "@fluidframework/common-definitions";
import { assert, performance, Deferred, TypedEventEmitter } from "@fluidframework/common-utils";
import { DocumentDeltaConnection } from "@fluidframework/driver-base";
import { OdspError } from "@fluidframework/odsp-driver-definitions";
import { IAnyDriverError } from "@fluidframework/driver-utils";
import { IFluidErrorBase, loggerToMonitoringContext } from "@fluidframework/telemetry-utils";
import {
    IClient,
    IConnect,
    INack,
    ISequencedDocumentMessage,
    ISignalMessage,
} from "@fluidframework/protocol-definitions";
import { v4 as uuid } from "uuid";
import { IOdspSocketError, IGetOpsResponse, IFlushOpsResponse } from "./contracts";
import { EpochTracker } from "./epochTracker";
import { errorObjectFromSocketError } from "./odspError";
import { pkgVersion } from "./packageVersion";

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

export interface ISocketEvents extends IEvent {
    (event: "server_disconnect", listener: (error: IFluidErrorBase & OdspError) => void);
}

class SocketReference extends TypedEventEmitter<ISocketEvents> {
    private references: number = 1;
    private delayDeleteTimeout: ReturnType<typeof setTimeout> | undefined;
    private _socket: SocketIOClient.Socket | undefined;

    // When making decisions about socket reuse, we do not reuse disconnected socket.
    // But we want to differentiate the following case from disconnected case:
    // Socket that never connected and never failed, it's in "attempting to connect" mode
    // such sockets should be reused, despite socket.disconnected === true
    private isPendingInitialConnection = true;

    // Map of all existing socket io sockets. [url, tenantId, documentId] -> socket
    private static readonly socketIoSockets: Map<string, SocketReference> = new Map();

    public static find(key: string, logger: ITelemetryLogger) {
        const socketReference = SocketReference.socketIoSockets.get(key);

        // Verify the socket is healthy before reusing it
        if (socketReference && socketReference.disconnected) {
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
     * @param key - socket reference key
     * @param isFatalError - true if the socket reference should be removed immediately due to a fatal error
     */
    public removeSocketIoReference(isFatalError: boolean) {
        assert(this.references > 0, 0x09f /* "No more socketIO refs to remove!" */);
        this.references--;

        // see comment in disconnected() getter
        this.isPendingInitialConnection = false;

        if (isFatalError || this.disconnected) {
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

    public get socket() {
        if (!this._socket) {
            throw new Error(`Invalid socket for key "${this.key}`);
        }
        return this._socket;
    }

    public constructor(public readonly key: string, socket: SocketIOClient.Socket) {
        super();

        this._socket = socket;
        assert(!SocketReference.socketIoSockets.has(key), 0x220 /* "socket key collision" */);
        SocketReference.socketIoSockets.set(key, this);

        // The server always closes the socket after sending this message
        // fully remove the socket reference now
        socket.on("server_disconnect", (socketError: IOdspSocketError) => {
            // Treat all errors as recoverable, and rely on joinSession / reconnection flow to
            // filter out retryable vs. non-retryable cases.
            const error = errorObjectFromSocketError(socketError, "server_disconnect");
            error.canRetry = true;

            // see comment in disconnected() getter
            // Setting it here to ensure socket reuse does not happen if new request to connect
            // comes in from "disconnect" listener below, before we close socket.
            this.isPendingInitialConnection = false;

            // Explicitly cast error to the specified event args type to ensure type compatibility
            this.emit("server_disconnect", error as IFluidErrorBase & OdspError);
            this.closeSocket();
        });
    }

    private clearTimer() {
        if (this.delayDeleteTimeout !== undefined) {
            clearTimeout(this.delayDeleteTimeout);
            this.delayDeleteTimeout = undefined;
        }
    }

    private closeSocket() {
        if (!this._socket) { return; }

        this.clearTimer();

        assert(SocketReference.socketIoSockets.get(this.key) === this,
            0x0a1 /* "Socket reference set unexpectedly does not point to this socket!" */);
        SocketReference.socketIoSockets.delete(this.key);

        const socket = this._socket;
        this._socket = undefined;

        // Delay closing socket, to make sure all users of socket observe the same event that causes
        // this instance to close, and thus properly record reason for closure.
        // All event raising is synchronous, so clients will have a chance to react before socket is
        // closed without any extra data on why it was closed.
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        Promise.resolve().then(() => { socket.disconnect(); });
    }

    private get disconnected() {
        if (this._socket === undefined) { return true; }
        if (this.socket.connected) { return false; }

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
     * @param io - websocket library
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
        token: string | null,
        io: SocketIOClientStatic,
        client: IClient,
        url: string,
        telemetryLogger: ITelemetryLogger,
        timeoutMs: number,
        epochTracker: EpochTracker,
        socketReferenceKeyPrefix: string | undefined): Promise<OdspDocumentDeltaConnection> {
        const mc = loggerToMonitoringContext(telemetryLogger);

        // enable multiplexing when the websocket url does not include the tenant/document id
        const parsedUrl = new URL(url);
        const enableMultiplexing = !parsedUrl.searchParams.has("documentId") && !parsedUrl.searchParams.has("tenantId");

        // do not include the specific tenant/doc id in the ref key when multiplexing
        // this will allow multiple documents to share the same websocket connection
        const key = socketReferenceKeyPrefix ? `${socketReferenceKeyPrefix},${url}` : url;
        const socketReferenceKey = enableMultiplexing ? key : `${key},${tenantId},${documentId}`;

        const socketReference = OdspDocumentDeltaConnection.getOrCreateSocketIoReference(
            io, timeoutMs, socketReferenceKey, url, enableMultiplexing, tenantId, documentId, telemetryLogger);

        const socket = socketReference.socket;

        const connectMessage: IConnect = {
            client,
            id: documentId,
            mode: client.mode,
            tenantId,
            token,  // Token is going to indicate tenant level information, etc...
            versions: protocolVersions,
            nonce: uuid(),
            epoch: epochTracker.fluidEpoch,
            relayUserAgent: [client.details.environment, ` driverVersion:${pkgVersion}`].join(";"),
        };

        // Reference to this client supporting get_ops flow.
        connectMessage.supportedFeatures = { };
        if (mc.config.getBoolean("Fluid.Driver.Odsp.GetOpsEnabled") !== false) {
            connectMessage.supportedFeatures[feature_get_ops] = true;
        }

        const deltaConnection = new OdspDocumentDeltaConnection(
            socket,
            documentId,
            socketReference,
            telemetryLogger,
            enableMultiplexing);

        try {
            await deltaConnection.initialize(connectMessage, timeoutMs);
            await epochTracker.validateEpochFromPush(deltaConnection.details);
        } catch (errorObject) {
            if (errorObject !== null && typeof errorObject === "object") {
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
                if (errorObject.statusCode === 400 || errorObject.statusCode === 404) {
                    errorObject.canRetry = true;
                }
            }
            throw errorObject;
        }

        return deltaConnection;
    }

    private socketReference: SocketReference | undefined;

    private readonly requestOpsNoncePrefix: string;
    private pushCallCounter = 0;
    private readonly getOpsMap: Map<string, { start: number, from: number, to: number }> = new Map();
    private flushOpNonce: string | undefined;
    private flushDeferred: Deferred<FlushResult> | undefined;

    /**
     * Error raising for socket.io issues
     */
    protected createErrorObject(handler: string, error?: any, canRetry = true): IAnyDriverError {
        // Note: we suspect the incoming error object is either:
        // - a socketError: add it to the OdspError object for driver to be able to parse it and reason over it.
        // - anything else: let base class handle it
        if (canRetry && Number.isInteger(error?.code) && typeof error?.message === "string") {
            return errorObjectFromSocketError(error as IOdspSocketError, handler);
        } else {
            return super.createErrorObject(handler, error, canRetry);
        }
    }

    /**
     * Gets or create a socket io connection for the given key
     */
    private static getOrCreateSocketIoReference(
        io: SocketIOClientStatic,
        timeoutMs: number,
        key: string,
        url: string,
        enableMultiplexing: boolean,
        tenantId: string,
        documentId: string,
        logger: ITelemetryLogger,
    ): SocketReference {
        const existingSocketReference = SocketReference.find(key, logger);
        if (existingSocketReference) {
            return existingSocketReference;
        }

        const query = enableMultiplexing ? undefined : { documentId, tenantId };

        const socket = io(
            url,
            {
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
        socket: SocketIOClient.Socket,
        documentId: string,
        socketReference: SocketReference,
        logger: ITelemetryLogger,
        private readonly enableMultiplexing?: boolean,
    ) {
        super(socket, documentId, logger);
        this.socketReference = socketReference;
        this.requestOpsNoncePrefix = `${uuid()}-`;
    }

    /**
     * Retrieves ops from PUSH
     * @param from - inclusive
     * @param to - exclusive
     * @returns ops retrieved
     */
     public requestOps(from: number, to: number) {
        // Given that to is exclusive, we should be asking for at least something!
        assert(to > from, 0x272 /* "empty request" */);

        // PUSH may disable this functionality
        // back-compat: remove cast to any once latest version of IConnected is consumed
        if ((this.details as any).supportedFeatures?.[feature_get_ops] !== true) {
            return;
        }

        this.pushCallCounter++;
        const nonce = `${this.requestOpsNoncePrefix}${this.pushCallCounter}`;
        const start = performance.now();

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
                duration: performance.now() - payloadToDelete.start,
            });
            this.getOpsMap.delete(key!);
        }
        this.getOpsMap.set(
            nonce,
            {
                start,
                from,
                to,
            },
        );
        this.socket.emit("get_ops", this.clientId, {
            nonce,
            from,
            to: to - 1,
        });
    }

    public async flush(): Promise<FlushResult> {
        // back-compat: remove cast to any once latest version of IConnected is consumed
        if ((this.details as any).supportedFeatures?.[feature_flush_ops] !== true) {
            // Once single-commit summary is enabled end-to-end, flush support is a must!
            // The only alternative is change in design where SPO fetches ops from PUSH OR
            // summary includes required ops and SPO has some validation mechanism to ensure
            // they are not forged by client.
            // If design changes, we can reconsider it, but right now it's non-recoverable failure.
            this.logger.sendErrorEvent({ eventName: "FlushOpsNotSupported" });
            throw new Error("flush() API is not supported by PUSH, required for single-commit summaries");
        }

        this.pushCallCounter++;
        const nonce = `${this.requestOpsNoncePrefix}${this.pushCallCounter}`;
        // There should be only one flush ops in flight, kicked out by upload summary workflow
        // That said, it could timeout and request could be repeated, so theoretically we can
        // get overlapping requests, but it should be very rare
        if (this.flushDeferred !== undefined) {
            this.logger.sendErrorEvent({ eventName: "FlushOpsTooMany" });
            this.flushDeferred.reject("process involving flush() was cancelled OR unsupported concurrency");
        }
        this.socket.emit("flush_ops", this.clientId, { nonce });

        this.flushOpNonce = nonce;
        this.flushDeferred = new Deferred<FlushResult>();
        return this.flushDeferred.promise;
    }

    protected serverDisconnectHandler = (error: IFluidErrorBase & OdspError) => {
        this.disposeCore(true, error);
    };

    protected async initialize(connectMessage: IConnect, timeout: number) {
        if (this.enableMultiplexing) {
            // multiplex compatible early handlers
            this.earlyOpHandler = (messageDocumentId: string, msgs: ISequencedDocumentMessage[]) => {
                if (this.documentId === messageDocumentId) {
                    this.queuedMessages.push(...msgs);
                }
            };

            this.earlySignalHandler = (msg: ISignalMessage, messageDocumentId?: string) => {
                if (messageDocumentId === undefined || messageDocumentId === this.documentId) {
                    this.queuedSignals.push(msg);
                }
            };
        }

        this.socketReference!.once("server_disconnect", this.serverDisconnectHandler);

        this.socket.on("get_ops_response", (result: IGetOpsResponse) => {
            const messages = result.messages;
            const data = this.getOpsMap.get(result.nonce);
            // Due to socket multiplexing, this client may not have asked for any data
            // If so, there it most likely does not need these ops (otherwise it already asked for them)
            // Also we may have deleted entry in this.getOpsMap due to too many requests and too slow response.
            // But not processing such result may push us into infinite loop of fast requests and dropping all responses
            if (data !== undefined || result.nonce.indexOf(this.requestOpsNoncePrefix) === 0) {
                this.getOpsMap.delete(result.nonce);
                const common = {
                    eventName: "GetOps",
                    // We need nonce only to pair with GetOpsTooMany events, i.e. when record was deleted
                    nonce: data === undefined ? result.nonce : undefined,
                    code: result.code,
                    from: data?.from,
                    to: data?.to,
                    duration: data === undefined ? undefined : performance.now() - data.start,
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

        this.socket.on("flush_ops_response", (result: IFlushOpsResponse) => {
            if (this.flushOpNonce === result.nonce) {
                const seq = result.lastPersistedSequenceNumber;
                let category: "generic" | "error" = "generic";
                if (result.lastPersistedSequenceNumber === undefined || result.code !== 200) {
                    switch (result.code) {
                        case 409:
                        case 429:
                            category = "error";
                            break;
                        case 204:
                            break;
                        default:
                            category = "error";
                            break;
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

        await super.initialize(connectMessage, timeout);
    }

    protected addTrackedListener(event: string, listener: (...args: any[]) => void) {
        // override some event listeners in order to support multiple documents/clients over the same websocket
        switch (event) {
            case "op":
                // per document op handling
                super.addTrackedListener(event, (documentId: string, msgs: ISequencedDocumentMessage[]) => {
                    if (!this.enableMultiplexing || this.documentId === documentId) {
                        listener(documentId, msgs);
                    }
                });
                break;

            case "signal":
                // per document signal handling
                super.addTrackedListener(event, (msg: ISignalMessage, documentId?: string) => {
                    if (!this.enableMultiplexing || !documentId || documentId === this.documentId) {
                        listener(msg, documentId);
                    }
                });
                break;

            case "nack":
                // per client / document nack handling
                super.addTrackedListener(event, (clientIdOrDocumentId: string, message: INack[]) => {
                    if (clientIdOrDocumentId.length === 0 ||
                        clientIdOrDocumentId === this.documentId ||
                        (this.hasDetails && clientIdOrDocumentId === this.clientId)) {
                        this.emit("nack", clientIdOrDocumentId, message);
                    }
                });
                break;

            default:
                super.addTrackedListener(event, listener);
                break;
        }
    }

    /**
     * Disconnect from the websocket
     */
    protected disconnect(socketProtocolError: boolean, reason: IAnyDriverError) {
        const socket = this.socketReference;
        assert(socket !== undefined, 0x0a2 /* "reentrancy not supported!" */);
        this.socketReference = undefined;

        this.socket.off("server_disconnect", this.serverDisconnectHandler);

        if (!socketProtocolError && this.hasDetails) {
            // tell the server we are disconnecting this client from the document
            this.socket.emit("disconnect_document", this.clientId, this.documentId);
        }

        socket.removeSocketIoReference(socketProtocolError);
        this.emit("disconnect", reason);
    }
}
