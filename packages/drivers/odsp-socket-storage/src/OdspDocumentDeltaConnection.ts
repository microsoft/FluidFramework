/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@microsoft/fluid-container-definitions";
import { TelemetryNullLogger } from "@microsoft/fluid-core-utils";
import { DocumentDeltaConnection, IConnect } from "@microsoft/fluid-driver-base";
import {
    ConnectionMode,
    IClient,
    IDocumentDeltaConnection,
} from "@microsoft/fluid-protocol-definitions";
import * as assert from "assert";
import { IOdspSocketError } from "./contracts";
import { debug } from "./debug";
import { errorObjectFromOdspError } from "./OdspUtils";

const protocolVersions = ["^0.3.0", "^0.2.0", "^0.1.0"];

// how long to wait before disconnecting the socket after the last reference is removed
// this allows reconnection after receiving a nack to be smooth
const socketReferenceBufferTime = 2000;

interface ISocketReference {
    socket: SocketIOClient.Socket | undefined;
    references: number;
    delayDeleteTimeout?: NodeJS.Timeout;
    delayDeleteTimeoutSetTime?: number;
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
        mode: ConnectionMode,
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
            mode,
            tenantId,
            token,  // token is going to indicate tenant level information, etc...
            versions: protocolVersions,
        };

        const deltaConnection = new OdspDocumentDeltaConnection(socket, webSocketId, socketReferenceKey);

        try {
            await deltaConnection.initialize(connectMessage);
        } catch (errorObject) {
            // Test if it's NetworkError with IOdspSocketError.
            // Note that there might be no IOdspSocketError on it in case we hit socket.io protocol errors!
            // So we test canRetry property first - if it false, that means protocol is broken and reconnecting will not help.
            if (errorObject !== null && typeof errorObject === "object" && errorObject.canRetry) {
                const socketError: IOdspSocketError = errorObject.socketError;
                if (typeof socketError === "object" && socketError !== null) {
                    throw errorObjectFromOdspError(socketError);
                }
            }
            throw errorObject;
        }

        return deltaConnection;
    }

    // Map of all existing socket io sockets. [url, tenantId, documentId] -> socket
    private static readonly socketIoSockets: Map<string, ISocketReference> = new Map();

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
        telemetryLogger: ITelemetryLogger): ISocketReference {
        let socketReference = OdspDocumentDeltaConnection.socketIoSockets.get(key);
        if (socketReference) {
            telemetryLogger.sendTelemetryEvent({
                references: socketReference.references,
                eventName: "OdspDocumentDeltaCollection.GetSocketIoReference",
                delayDeleteDelta: socketReference.delayDeleteTimeoutSetTime !== undefined ?
                    (Date.now() - socketReference.delayDeleteTimeoutSetTime) : undefined,
            });

            socketReference.references++;

            // clear the pending deletion if there is one
            if (socketReference.delayDeleteTimeout !== undefined) {
                clearTimeout(socketReference.delayDeleteTimeout);
                socketReference.delayDeleteTimeout = undefined;
                socketReference.delayDeleteTimeoutSetTime = undefined;
            }

            debug(`Using existing socketio reference for ${key} (${socketReference.references})`);

        } else {
            const socket = io(
                url,
                {
                    multiplex: false, // don't rely on socket.io built-in multiplexing
                    query: {
                        documentId,
                        tenantId,
                    },
                    reconnection: false,
                    transports: ["websocket"],
                    timeout: timeoutMs,
                });

            socket.on("server_disconnect", (socketError: IOdspSocketError) => {
                // Raise it as disconnect.
                // That produces cleaner telemetry (no errors) and keeps protocol simpler (and not driver-specific).
                socket.emit("disconnect", errorObjectFromOdspError(socketError));
            });

            socketReference = {
                socket,
                references: 1,
            };

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
    private static removeSocketIoReference(key: string, isFatalError?: boolean) {
        const socketReference = OdspDocumentDeltaConnection.socketIoSockets.get(key);
        if (!socketReference) {
            // this is expected to happens if we removed the reference due the socket not being connected
            return;
        }

        socketReference.references--;
        assert(socketReference.delayDeleteTimeout === undefined);

        debug(`Removed socketio reference for ${key}. Remaining references: ${socketReference.references}.`);

        if (isFatalError || (socketReference.socket && !socketReference.socket.connected)) {
            // delete the reference if a fatal error occurred or if the socket is not connected
            if (socketReference.socket) {
                socketReference.socket.disconnect();
                socketReference.socket = undefined;
            }

            OdspDocumentDeltaConnection.socketIoSockets.delete(key);
            debug(`Deleted socketio reference for ${key}. Is fatal error: ${isFatalError}.`);
            return;
        }

        if (socketReference.references === 0) {
            socketReference.delayDeleteTimeout = setTimeout(() => {
                OdspDocumentDeltaConnection.socketIoSockets.delete(key);

                if (socketReference.socket) {
                    socketReference.socket.disconnect();
                    socketReference.socket = undefined;
                }

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
    }

    /**
     * Disconnect from the websocket
     */
    public disconnect(socketProtocolError: boolean = false) {
        if (this.socketReferenceKey === undefined) {
            throw new Error("Invalid socket reference key");
        }

        OdspDocumentDeltaConnection.removeSocketIoReference(this.socketReferenceKey);
        this.socketReferenceKey = undefined;

        this.emit("disconnect", "client closing connection");
    }
}
