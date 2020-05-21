/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { TelemetryNullLogger } from "@fluidframework/common-utils";
import { DocumentDeltaConnection } from "@microsoft/fluid-driver-base";
import { IDocumentDeltaConnection, IError } from "@microsoft/fluid-driver-definitions";
import {
    IClient,
    IConnect,
    INack,
} from "@microsoft/fluid-protocol-definitions";
// eslint-disable-next-line import/no-internal-modules
import uuid from "uuid/v4";
import { IOdspSocketError } from "./contracts";
import { debug } from "./debug";
import { errorObjectFromSocketError, socketErrorRetryFilter } from "./odspUtils";

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
    private readonly nonForwardEvents = ["nack"];

    /**
     * Create a OdspDocumentDeltaConnection
     * If url #1 fails to connect, will try url #2 if applicable.
     *
     * @param tenantId - the ID of the tenant
     * @param webSocketId - webSocket ID
     * @param token - authorization token for storage service
     * @param io - websocket library
     * @param client - information about the client
     * @param mode - mode of the client
     * @param url - websocket URL
     * @param telemetryLogger - optional telemetry logger
     */
    public static async create(
        tenantId: string,
        webSocketId: string,
        token: string | null,
        io: SocketIOClientStatic,
        client: IClient,
        url: string,
        timeoutMs: number = 20000,
        telemetryLogger: ITelemetryLogger = new TelemetryNullLogger()): Promise<IDocumentDeltaConnection> {
        const socketReferenceKey = `${url},${tenantId},${webSocketId}`;

        const socketReference = OdspDocumentDeltaConnection.getOrCreateSocketIoReference(
            io, timeoutMs, socketReferenceKey, url, tenantId, webSocketId, telemetryLogger);

        const socket = socketReference.socket;
        if (!socket) {
            throw new Error(`Invalid socket for key "${socketReferenceKey}`);
        }

        const connectMessage: IConnect = {
            client,
            id: webSocketId,
            mode: client.mode,
            tenantId,
            token,  // Token is going to indicate tenant level information, etc...
            versions: protocolVersions,
            nonce: uuid(),
        };

        const deltaConnection = new OdspDocumentDeltaConnection(socket, webSocketId, socketReferenceKey);

        try {
            await deltaConnection.initialize(connectMessage, timeoutMs);
        } catch (errorObject) {
            // Test if it's NetworkError with IOdspSocketError. Note that there might be no IOdspSocketError on it in
            // case we hit socket.io protocol errors! So we test canRetry property first - if it false, that means
            // protocol is broken and reconnecting will not help.
            if (errorObject !== null && typeof errorObject === "object" && errorObject.canRetry) {
                const socketError: IOdspSocketError = errorObject.socketError;
                if (typeof socketError === "object" && socketError !== null) {
                    throw errorObjectFromSocketError(socketError, socketErrorRetryFilter);
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
            const socket = io(
                url,
                {
                    multiplex: false, // Don't rely on socket.io built-in multiplexing
                    query: {
                        documentId,
                        tenantId,
                    },
                    reconnection: false,
                    transports: ["websocket"],
                    timeout: timeoutMs,
                });

            socket.on("server_disconnect", (socketError: IOdspSocketError) => {
                // We get 403 / TokenExpired here. We cannot treat it as unrecoverable error!
                // So we treat all errors as recoverable, and rely on joinSession / reconnection flow to
                // filter out retryable vs. non-retryable cases.
                // Specifically, it will have one retry for 403 - see
                // connectToDeltaStream() / getWithRetryForTokenRefresh() call.
                const error = errorObjectFromSocketError(socketError);

                // The server always closes the socket after sending this message
                // fully remove the socket reference now
                // This raises "disconnect" event with proper error object.
                OdspDocumentDeltaConnection.removeSocketIoReference(key, true /* socketProtocolError */, error);
            });

            socketReference = new SocketReference(socket);

            OdspDocumentDeltaConnection.socketIoSockets.set(key, socketReference);
            debug(`Created new socketio reference for ${key}`);
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
        reason: string | IError) {
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
     */
    constructor(
        socket: SocketIOClient.Socket,
        documentId: string,
        private socketReferenceKey: string | undefined) {
        super(socket, documentId);

        // when possible emit nacks only when it targets this specific client/document
        super.addTrackedListener("nack", (clientIdOrDocumentId: string, message: INack[]) => {
            if (clientIdOrDocumentId.length === 0 ||
                clientIdOrDocumentId === documentId ||
                (this.hasDetails && clientIdOrDocumentId === this.clientId)) {
                this.emit("nack", clientIdOrDocumentId, message);
            }
        });
    }

    protected addTrackedListener(event: string, listener: (...args: any[]) => void) {
        if (!this.nonForwardEvents.includes(event)) {
            super.addTrackedListener(event, listener);
        } else {
            // this is a "nonforward" event
            // don't directly link up this socket event to the listener
            // we will handle the event from a listener in the constructor
        }
    }

    /**
     * Disconnect from the websocket
     */
    public disconnect(socketProtocolError: boolean = false) {
        if (this.socketReferenceKey !== undefined) {
            const key = this.socketReferenceKey;
            this.socketReferenceKey = undefined;

            const reason = "client closing connection";
            OdspDocumentDeltaConnection.removeSocketIoReference(key, socketProtocolError, reason);

            // RemoveSocketIoReference() above raises "disconnect" event on socket for socketProtocolError === true
            // If it's not critical error, we want to raise event on this object only.
            this.emit("disconnect", reason);
        }
    }
}
