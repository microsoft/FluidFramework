/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@microsoft/fluid-container-definitions";
import { TelemetryNullLogger } from "@microsoft/fluid-core-utils";
import { createErrorObject, DocumentDeltaConnection, IConnect, IConnected } from "@microsoft/fluid-driver-base";
import {
    ConnectionMode,
    IClient,
    IContentMessage,
    IDocumentDeltaConnection,
    ISequencedDocumentMessage,
    ISignalMessage,
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

        return this.createForUrlWithTimeout(
            tenantId,
            webSocketId,
            token,
            io,
            client,
            url,
            mode,
            timeoutMs,
            telemetryLogger,
        );
    }

    // Map of all existing socket io sockets. [url, tenantId, documentId] -> socket
    private static readonly socketIoSockets: Map<string, ISocketReference> = new Map();

    /**
     * Create a OdspDocumentDeltaConnection to the specific url
     *
     * @param tenantId - the ID of the tenant
     * @param id - document ID
     * @param token - authorization token for storage service
     * @param io - websocket library
     * @param client - information about the client
     * @param url - websocket URL
     * @param timeoutMs - timeout for socket connection attempt in milliseconds
     * @param telemetryLogger - telemetry logger
     */
    // tslint:disable-next-line: max-func-body-length
    private static async createForUrlWithTimeout(
        tenantId: string,
        webSocketId: string,
        token: string | null,
        io: SocketIOClientStatic,
        client: IClient,
        url: string,
        mode: ConnectionMode,
        timeoutMs: number,
        telemetryLogger: ITelemetryLogger): Promise<IDocumentDeltaConnection> {
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

        // tslint:disable-next-line: max-func-body-length
        const connection = await new Promise<IConnected>((resolve, reject) => {
            // Listen for ops sent before we receive a response to connect_document
            const queuedMessages: ISequencedDocumentMessage[] = [];
            const queuedContents: IContentMessage[] = [];
            const queuedSignals: ISignalMessage[] = [];

            let cleanupListeners: () => void;

            const disconnectAndReject = (errorObject: any, isFatalError?: boolean) => {
                cleanupListeners();
                OdspDocumentDeltaConnection.removeSocketIoReference(socketReferenceKey, isFatalError);

                // Test if it's NetworkError with IOdspSocketError.
                // Note that there might be no IOdspSocketError on it in case we hit socket.io protocol errors!
                // So we test canRetry property first - if it false, that means protocol is broken and reconnecting will not help.
                if (errorObject !== null && typeof errorObject === "object" && errorObject.canRetry) {
                    const socketError: IOdspSocketError = errorObject.socketError;
                    if (typeof socketError === "object" && socketError !== null) {
                        reject(errorObjectFromOdspError(socketError));
                        return;
                    }
                }

                reject(errorObject);
            };

            const connectErrorHandler = (error) => {
                debug(`Socket connection error: [${error}]`);
                disconnectAndReject(createErrorObject("connect_error", error), true);
            };

            const connectTimeoutHandler = () => {
                disconnectAndReject(createErrorObject("connect_timeout", "Socket connection timed out"), true);
            };

            const errorHandler = (error) => {
                debug(`Error in documentDeltaConection: ${error}`);

                // This includes "Invalid namespace" error, which we consider critical (reconnecting will not help)
                disconnectAndReject(createErrorObject("error", error, error !== "Invalid namespace"), true);
            };

            const earlyOpHandler = (socketId: string, msgs: ISequencedDocumentMessage[]) => {
                if (socketId === webSocketId) {
                    debug("Queued early ops", msgs.length);
                    queuedMessages.push(...msgs);
                }
            };

            const earlyOpContentHandler = (msg: IContentMessage) => {
                debug("Queued early contents");
                queuedContents.push(msg);
            };

            const earlySignalHandler = (msg: ISignalMessage) => {
                debug("Queued early signals");
                queuedSignals.push(msg);
            };

            const connectDocumentSuccessHandler = (response: IConnected) => {
                if (queuedMessages.length > 0) {
                    // some messages were queued.
                    // add them to the list of initialMessages to be processed
                    if (!response.initialMessages) {
                        response.initialMessages = [];
                    }

                    response.initialMessages.push(...queuedMessages);

                    response.initialMessages.sort((a, b) => a.sequenceNumber - b.sequenceNumber);
                }

                if (queuedContents.length > 0) {
                    // some contents were queued.
                    // add them to the list of initialContents to be processed
                    if (!response.initialContents) {
                        response.initialContents = [];
                    }

                    response.initialContents.push(...queuedContents);

                    response.initialContents.sort((a, b) =>
                        // tslint:disable-next-line:strict-boolean-expressions
                        (a.clientId === b.clientId) ? 0 : ((a.clientId < b.clientId) ? -1 : 1) ||
                            a.clientSequenceNumber - b.clientSequenceNumber);
                }

                if (queuedSignals.length > 0) {
                    // some signals were queued.
                    // add them to the list of initialSignals to be processed
                    if (!response.initialSignals) {
                        response.initialSignals = [];
                    }

                    response.initialSignals.push(...queuedSignals);
                }

                cleanupListeners();
                resolve(response);
            };

            const connectDocumentErrorHandler = (error) => {
                // This is not an error for the socket - it's a protocol error.
                // In this case we disconnect the socket and indicate that we were unable to create the
                // OdspDocumentDeltaConnection.
                disconnectAndReject(createErrorObject("connect_document_error", error));
            };

            // Cleanup all the listeners we add
            cleanupListeners = () => {
                socket.removeListener("error", errorHandler);
                socket.removeListener("connect_error", connectErrorHandler);
                socket.removeListener("connect_timeout", connectTimeoutHandler);
                socket.removeListener("op", earlyOpHandler);
                socket.removeListener("op-content", earlyOpContentHandler);
                socket.removeListener("signal", earlySignalHandler);
                socket.removeListener("connect_document_success", connectDocumentSuccessHandler);
                socket.removeListener("connect_document_error", connectDocumentErrorHandler);
            };

            // Listen for socket.io errors
            socket.on("error", errorHandler);

            // Listen for connection issues
            socket.on("connect_error", connectErrorHandler);

            // Listen for timeouts
            socket.on("connect_timeout", connectTimeoutHandler);

            // Listen for early ops and signals
            socket.on("op", earlyOpHandler);
            socket.on("op-content", earlyOpContentHandler);
            socket.on("signal", earlySignalHandler);

            // Listen for connect document events
            socket.on("connect_document_success", connectDocumentSuccessHandler);
            socket.on("connect_document_error", connectDocumentErrorHandler);

            socket.emit("connect_document", connectMessage);
        });

        return new OdspDocumentDeltaConnection(socket, webSocketId, connection, socketReferenceKey);
    }

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
        webSockeId: string,
        details: IConnected,
        private socketReferenceKey: string | undefined) {
        super(socket, webSockeId, details);
        socket.on("server_disconnect", (socketError: IOdspSocketError) => {
            // Raise it as disconnect.
            // That produces cleaner telemetry (no errors) and keeps protocol simpler (and not driver-specific).
            this.emit("disconnect", errorObjectFromOdspError(socketError));
        });
    }

    /**
     * Disconnect from the websocket
     */
    public disconnect() {
        if (this.socketReferenceKey === undefined) {
            throw new Error("Invalid socket reference key");
        }

        OdspDocumentDeltaConnection.removeSocketIoReference(this.socketReferenceKey);
        this.socketReferenceKey = undefined;
    }
}
