/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { DocumentDeltaConnection } from "@fluidframework/driver-base";
import { IDocumentDeltaConnection, DriverError } from "@fluidframework/driver-definitions";
import { OdspError } from "@fluidframework/odsp-doclib-utils";
import {
    IClient,
    IConnect,
    INack,
    ISequencedDocumentMessage,
    ISignalMessage,
} from "@fluidframework/protocol-definitions";
// eslint-disable-next-line import/no-internal-modules
import uuid from "uuid/v4";
import { IOdspSocketError } from "./contracts";
import { debug } from "./debug";
import { errorObjectFromSocketError } from "./odspError";

const protocolVersions = ["^0.4.0", "^0.3.0", "^0.2.0", "^0.1.0"];

// How long to wait before disconnecting the socket after the last reference is removed
// This allows reconnection after receiving a nack to be smooth
const socketReferenceBufferTime = 2000;

class SocketReference {
    public references: number = 1;
    public delayDeleteTimeout?: NodeJS.Timeout;
    public delayDeleteTimeoutSetTime?: number;

    public constructor(public socket: SocketIOClient.Socket | undefined) {
    }

    public clearTimer() {
        if (this.delayDeleteTimeout !== undefined) {
            clearTimeout(this.delayDeleteTimeout);
            this.delayDeleteTimeout = undefined;
            this.delayDeleteTimeoutSetTime = undefined;
        }
    }

    public closeSocket() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = undefined;
        }
    }
}

/**
 * Represents a connection to a stream of delta updates
 */
export class OdspDocumentDeltaConnection extends DocumentDeltaConnection implements IDocumentDeltaConnection {
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
        timeoutMs: number = 20000,
        telemetryLogger: ITelemetryLogger = new TelemetryNullLogger()): Promise<IDocumentDeltaConnection> {
        // enable multiplexing when the websocket url does not include the tenant/document id
        const parsedUrl = new URL(url);
        const enableMultiplexing = !parsedUrl.searchParams.has("documentId") && !parsedUrl.searchParams.has("tenantId");

        // do not include the specific tenant/doc id in the ref key when multiplexing
        // this will allow multiple documents to share the same websocket connection
        const socketReferenceKey = enableMultiplexing ? url : `${url},${tenantId},${documentId}`;

        const socketReference = OdspDocumentDeltaConnection.getOrCreateSocketIoReference(
            io, timeoutMs, socketReferenceKey, url, enableMultiplexing, tenantId, documentId, telemetryLogger);

        const socket = socketReference.socket;
        if (!socket) {
            throw new Error(`Invalid socket for key "${socketReferenceKey}`);
        }

        const connectMessage: IConnect = {
            client,
            id: documentId,
            mode: client.mode,
            tenantId,
            token,  // Token is going to indicate tenant level information, etc...
            versions: protocolVersions,
            nonce: uuid(),
        };

        const deltaConnection = new OdspDocumentDeltaConnection(
            socket,
            documentId,
            socketReferenceKey,
            enableMultiplexing);

        try {
            await deltaConnection.initialize(connectMessage, timeoutMs);
        } catch (errorObject) {
            // Test if it's NetworkError with IOdspSocketError. Note that there might be no IOdspSocketError on it in
            // case we hit socket.io protocol errors! So we test canRetry property first - if it false, that means
            // protocol is broken and reconnecting will not help.
            if (errorObject !== null && typeof errorObject === "object" && errorObject.canRetry) {
                const socketError: IOdspSocketError = errorObject.socketError;
                if (typeof socketError === "object" && socketError !== null) {
                    // We have to special-case error types here in terms of what is retriable.
                    // These errors have to re retried, we just need new joinSession result to connect to right server:
                    //    400: Invalid tenant or document id. The WebSocket is connected to a different document
                    //         Document is full (with retryAfter)
                    //    404: Invalid document. The document \"local/w1-...\" does not exist
                    // But this has to stay not-retryable:
                    //    406: Unsupported client protocol. This path is the only gatekeeper, have to fail!
                    // This one is fine either way
                    //    401/403: Code will retry once with new token either way, then it becomes fatal - on this path
                    //         and on join Session path.
                    //    501: (Fluid not enabled): this is fine either way, as joinSession is gatekeeper
                    const error = errorObjectFromSocketError(socketError);
                    if (socketError.code === 400 || socketError.code === 404) {
                        error.canRetry = true;
                    }
                    throw error;
                }
            }
            throw errorObject;
        }

        return deltaConnection;
    }

    // Map of all existing socket io sockets. [url, tenantId, documentId] -> socket
    private static readonly socketIoSockets: Map<string, SocketReference> = new Map();

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
        telemetryLogger: ITelemetryLogger): SocketReference {
        let socketReference = OdspDocumentDeltaConnection.socketIoSockets.get(key);

        // Verify the socket is healthy before reusing it
        if (socketReference && (!socketReference.socket || !socketReference.socket.connected)) {
            // The socket is in a bad state. fully remove the reference
            OdspDocumentDeltaConnection.removeSocketIoReference(key, true, "socket is closed");

            socketReference = undefined;
        }

        if (socketReference) {
            telemetryLogger.sendTelemetryEvent({
                references: socketReference.references,
                eventName: "OdspDocumentDeltaCollection.GetSocketIoReference",
                delayDeleteDelta: socketReference.delayDeleteTimeoutSetTime !== undefined ?
                    (Date.now() - socketReference.delayDeleteTimeoutSetTime) : undefined,
            });

            socketReference.references++;

            // Clear the pending deletion if there is one
            socketReference.clearTimer();

            debug(`Using existing socketio reference for ${key} (${socketReference.references})`);
        } else {
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

            socket.on("server_disconnect", (socketError: IOdspSocketError) => {
                // Treat all errors as recoverable, and rely on joinSession / reconnection flow to
                // filter out retryable vs. non-retryable cases.
                const error = errorObjectFromSocketError(socketError);
                error.canRetry = true;

                // The server always closes the socket after sending this message
                // fully remove the socket reference now
                // This raises "disconnect" event with proper error object.
                OdspDocumentDeltaConnection.removeSocketIoReference(key, true /* socketProtocolError */, error);
            });

            socketReference = new SocketReference(socket);

            OdspDocumentDeltaConnection.socketIoSockets.set(key, socketReference);
            debug(`Created new socketio reference for ${key}. multiplexing: ${enableMultiplexing}`);
        }

        return socketReference;
    }

    /**
     * Removes a reference for the given key
     * Once the ref count hits 0, the socket is disconnected and removed
     * @param key - socket reference key
     * @param isFatalError - true if the socket reference should be removed immediately due to a fatal error
     */
    private static removeSocketIoReference(
        key: string,
        isFatalError: boolean,
        reason: string | OdspError) {
        const socketReference = OdspDocumentDeltaConnection.socketIoSockets.get(key);
        if (!socketReference) {
            // This is expected to happen if we removed the reference due the socket not being connected
            return;
        }

        socketReference.references--;

        debug(`Removed socketio reference for ${key}. Remaining references: ${socketReference.references}.`);

        if (isFatalError || (socketReference.socket && !socketReference.socket.connected)) {
            // Clear the pending deletion if there is one
            socketReference.clearTimer();

            OdspDocumentDeltaConnection.socketIoSockets.delete(key);
            debug(`Deleted socketio reference for ${key}. Is fatal error: ${isFatalError}.`);

            // Raise "disconnect" event before closing.
            // That produces cleaner telemetry with reason behind closure
            if (socketReference.socket) {
                socketReference.socket.emit("disconnect", reason);
            }
            socketReference.closeSocket();
            return;
        }

        if (socketReference.references === 0 && socketReference.delayDeleteTimeout === undefined) {
            socketReference.delayDeleteTimeout = setTimeout(() => {
                // We should not get here with active users.
                assert(socketReference.references === 0);

                OdspDocumentDeltaConnection.socketIoSockets.delete(key);
                socketReference.closeSocket();

                debug(`Deleted socketio reference for ${key}.`);
            }, socketReferenceBufferTime);
            socketReference.delayDeleteTimeoutSetTime = Date.now();
        }
    }

    /**
     * @param socket - websocket to be used
     * @param documentId - ID of the document
     * @param details - details of the websocket connection
     * @param socketReferenceKey - socket reference key
     * @param enableMultiplexing - If the websocket is multiplexing multiple documents
     */
    constructor(
        socket: SocketIOClient.Socket,
        documentId: string,
        private socketReferenceKey: string | undefined,
        private readonly enableMultiplexing?: boolean) {
        super(socket, documentId);
    }

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
        const key = this.socketReferenceKey;
        assert(key !== undefined, "reentrancy not supported!");
        this.socketReferenceKey = undefined;

        if (!socketProtocolError && this.hasDetails) {
            // tell the server we are disconnecting this client from the document
            this.socket.emit("disconnect_document", this.clientId, this.documentId);
        }

        OdspDocumentDeltaConnection.removeSocketIoReference(key, socketProtocolError, reason);

        // RemoveSocketIoReference() above raises "disconnect" event on socket for socketProtocolError === true
        // If it's not critical error, we want to raise event on this object only.
        this.emit("disconnect", reason);
    }
}
