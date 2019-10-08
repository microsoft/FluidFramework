/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { createErrorObject, DocumentDeltaConnection, IConnect, IConnected } from "@microsoft/fluid-driver-base";
import {
    ConnectionMode,
    IClient,
    IContentMessage,
    IDocumentDeltaConnection,
    ISequencedDocumentMessage,
    ISignalMessage,
} from "@microsoft/fluid-protocol-definitions";
import { debug } from "./debug";

const protocolVersions = ["^0.3.0", "^0.2.0", "^0.1.0"];

interface ISocketReference {
    socket: SocketIOClient.Socket | undefined;
    references: number;
    pendingConnect?: Promise<IConnected>;
}

/**
 * Represents a connection to a stream of delta updates
 */
export class OdspDocumentDeltaConnection extends DocumentDeltaConnection implements IDocumentDeltaConnection {
    /**
     * Create a OdspDocumentDeltaConnection
     *
     * @param tenantId - the ID of the tenant
     * @param id - document ID
     * @param token - authorization token for storage service
     * @param io - websocket library
     * @param client - information about the client
     * @param url - websocket URL
     */
    // tslint:disable-next-line: max-func-body-length
    public static async create(
        tenantId: string,
        id: string,
        token: string | null,
        io: SocketIOClientStatic,
        client: IClient,
        url: string,
        mode: ConnectionMode): Promise<IDocumentDeltaConnection> {

        const socketReferenceKey = `${url},${tenantId},${id}`;

        const socketReference = OdspDocumentDeltaConnection.getOrCreateSocketIoReference(
            io, socketReferenceKey, url, tenantId, id);

        const socket = socketReference.socket;
        if (!socket) {
            throw new Error(`Invalid socket for key "${socketReferenceKey}`);
        }

        if (socketReference.pendingConnect) {
            // another connection is in progress. wait for it to finish
            try {
                await socketReference.pendingConnect;
            } catch (ex) {
                // ignore any error from it
            }
        }

        const connectMessage: IConnect = {
            client,
            id,
            mode,
            tenantId,
            token,  // token is going to indicate tenant level information, etc...
            versions: protocolVersions,
        };

        // tslint:disable-next-line:max-func-body-length
        socketReference.pendingConnect = new Promise<IConnected>((resolve, reject) => {
            // Listen for ops sent before we receive a response to connect_document
            const queuedMessages: ISequencedDocumentMessage[] = [];
            const queuedContents: IContentMessage[] = [];
            const queuedSignals: ISignalMessage[] = [];

            const disconnect = () => {
                OdspDocumentDeltaConnection.removeSocketIoReference(socketReferenceKey);
            };

            const earlyOpHandler = (documentId: string, msgs: ISequencedDocumentMessage[]) => {
                if (documentId === id) {
                    debug("Queued early ops", msgs.length);
                    queuedMessages.push(...msgs);
                }
            };
            socket.on("op", earlyOpHandler);

            const earlyContentHandler = (msg: IContentMessage) => {
                debug("Queued early contents");
                queuedContents.push(msg);
            };
            socket.on("op-content", earlyContentHandler);

            const earlySignalHandler = (msg: ISignalMessage) => {
                debug("Queued early signals");
                queuedSignals.push(msg);
            };
            socket.on("signal", earlySignalHandler);

            // Listen for connection issues
            socket.on("connect_error", (error) => {
                debug(`Socket connection error: [${error}]`);
                reject(createErrorObject("connect_error", error));
            });

            // Listen for timeouts
            socket.on("connect_timeout", () => {
                reject(createErrorObject("connect_timeout", "Socket connection timed out"));
            });

            socket.on("connect_document_success", (response: IConnected) => {
                socket.removeListener("op", earlyOpHandler);
                socket.removeListener("op-content", earlyContentHandler);
                socket.removeListener("signal", earlySignalHandler);

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

                debug("signals", JSON.stringify(response.initialSignals));

                resolve(response);
            });

            socket.on("error", ((error) => {
                debug(`Error in documentDeltaConection: ${error}`);

                // This includes "Invalid namespace" error, which we consider critical (reconnecting will not help)
                disconnect();

                reject(createErrorObject("error", error, error !== "Invalid namespace"));
            }));

            socket.on("connect_document_error", ((error) => {
                // This is not an error for the socket - it's a protocol error.
                // In this case we disconnect the socket and indicate that we were unable to create the
                // OdspDocumentDeltaConnection.
                disconnect();

                reject(createErrorObject("connect_document_error", error));
            }));

            socket.emit("connect_document", connectMessage);
        });

        const connection = await socketReference.pendingConnect;
        socketReference.pendingConnect = undefined;

        return new OdspDocumentDeltaConnection(socket, id, connection, socketReferenceKey);
    }

    // Map of all existing socket io sockets. [url, tenantId, documentId] -> socket
    private static readonly socketIoSockets: Map<string, ISocketReference> = new Map();

    /**
     * Gets or create a socket io connection for the given key
     */
    private static getOrCreateSocketIoReference(
        io: SocketIOClientStatic,
        key: string,
        url: string,
        tenantId: string,
        documentId: string): ISocketReference {
        let socketReference = OdspDocumentDeltaConnection.socketIoSockets.get(key);
        if (socketReference) {
            socketReference.references++;
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
     */
    private static removeSocketIoReference(key: string) {
        const socketReference = OdspDocumentDeltaConnection.socketIoSockets.get(key);
        if (!socketReference) {
            throw new Error(`Invalid socket reference for "${key}"`);
        }

        socketReference.references--;
        if (socketReference.references === 0) {
            OdspDocumentDeltaConnection.socketIoSockets.delete(key);

            if (socketReference.socket) {
                socketReference.socket.disconnect();
                socketReference.socket = undefined;
            }

            debug(`Removed socketio reference ${key}`);
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
        details: IConnected,
        private socketReferenceKey: string | undefined) {
        super(socket, documentId, details);
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
