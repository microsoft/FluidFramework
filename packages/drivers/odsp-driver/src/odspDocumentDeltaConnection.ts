/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { assert, performance } from "@fluidframework/common-utils";
import { DocumentDeltaConnection } from "@fluidframework/driver-base";
import { DriverError } from "@fluidframework/driver-definitions";
import {
    IClient,
    IConnect,
    INack,
    ISequencedDocumentMessage,
    ISignalMessage,
} from "@fluidframework/protocol-definitions";
import { v4 as uuid } from "uuid";
import { IOdspSocketError } from "./contracts";
import { EpochTracker } from "./epochTracker";
import { errorObjectFromSocketError } from "./odspError";

const protocolVersions = ["^0.4.0", "^0.3.0", "^0.2.0", "^0.1.0"];

// How long to wait before disconnecting the socket after the last reference is removed
// This allows reconnection after receiving a nack to be smooth
const socketReferenceBufferTime = 2000;

class SocketReference {
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
        this._socket = socket;
        assert(!SocketReference.socketIoSockets.has(key), "socket key collision");
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

            socket.emit("disconnect", error);
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
        // this instance to close, and thus properly record reason for clusure.
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
        epochTracker: EpochTracker): Promise<OdspDocumentDeltaConnection>
    {
        // enable multiplexing when the websocket url does not include the tenant/document id
        const parsedUrl = new URL(url);
        const enableMultiplexing = !parsedUrl.searchParams.has("documentId") && !parsedUrl.searchParams.has("tenantId");

        // do not include the specific tenant/doc id in the ref key when multiplexing
        // this will allow multiple documents to share the same websocket connection
        const socketReferenceKey = enableMultiplexing ? url : `${url},${tenantId},${documentId}`;

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
        };

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
    private getOpsCounter = 0;
    private readonly getOpsMap: Map<string, { start: number, from: number, to: number }> = new Map();

    /**
     * Error raising for socket.io issues
     */
    protected createErrorObject(handler: string, error?: any, canRetry = true): DriverError {
        // Note: we suspect the incoming error object is either:
        // - a string: log it in the message (if not a string, it may contain PII but will print as [object Object])
        // - a socketError: add it to the OdspError object for driver to be able to parse it and reason
        //   over it.
        if (canRetry && typeof error === "object" && error !== null) {
            return errorObjectFromSocketError(error, handler) as DriverError;
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
        logger: ITelemetryLogger): SocketReference
    {
        const existingSocketReference  = SocketReference.find(key, logger);
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
        private readonly enableMultiplexing?: boolean)
    {
        super(socket, documentId, logger);
        this.socketReference = socketReference;
        this.requestOpsNoncePrefix = `${this.documentId}-`;
    }

    public requestOps(from: number, to: number) {
        this.getOpsCounter++;
        const nonce = `${this.requestOpsNoncePrefix}${this.getOpsCounter}`;

        // PUSH may disable this functionality, in such case we will keep accumulating memory for nothing.
        // Prevent that by allowing to track only 10 overlapping requests.
        // Telemetry in get_ops_response will clearly indicate when we have over 5 requests.
        // Note that we should never have overlapping requests, as DeltaManager allows only one
        // outstanding request to storage, and that's the only way to get here.
        if (this.getOpsMap.size < 5) {
            this.getOpsMap.set(
                nonce,
                {
                    start: performance.now(),
                    from,
                    to,
                },
            );
        }
        this.socket.emit("get_ops", this.clientId, {
            nonce,
            from,
            to,
        });
    }

    protected async initialize(connectMessage: IConnect, timeout: number) {
        if (this.enableMultiplexing) {
            // multiplex compatible early handlers
            this.earlyOpHandler = (messageDocumentId: string, msgs: ISequencedDocumentMessage[]) => {
                if (this.documentId === messageDocumentId) {
                    this.queuedMessages.push(...msgs);
                }
            };
        }

        this.socket.on("get_ops_response", (result) => {
            const messages = result.messages as ISequencedDocumentMessage[] | undefined;
            const data = this.getOpsMap.get(result.nonce);
            // Due to socket multiplexing, this client may not have asked for any data
            // If so, there it most likely does not need these ops (otherwise it already asked for them)
            if (data !== undefined) {
                this.getOpsMap.delete(result.nonce);
                if (messages !== undefined && messages.length > 0) {
                    this.logger.sendPerformanceEvent({
                        eventName: "GetOps",
                        first: messages[0].sequenceNumber,
                        last: messages[messages.length - 1].sequenceNumber,
                        code: result.code,
                        from: data.from,
                        to: data.to,
                        duration: performance.now() - data.start,
                        length: messages.length,
                    });
                    this.socket.emit("op", this.documentId, messages);
                }
            }
        });

        return super.initialize(connectMessage, timeout);
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
    protected disconnect(socketProtocolError: boolean, reason: DriverError) {
        const socket = this.socketReference;
        assert(socket !== undefined, 0x0a2 /* "reentrancy not supported!" */);
        this.socketReference = undefined;

        if (!socketProtocolError && this.hasDetails) {
            // tell the server we are disconnecting this client from the document
            this.socket.emit("disconnect_document", this.clientId, this.documentId);
        }

        socket.removeSocketIoReference(socketProtocolError);
        this.emit("disconnect", reason);
    }
}
