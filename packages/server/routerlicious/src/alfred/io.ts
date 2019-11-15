/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { isSystemType } from "@microsoft/fluid-core-utils";
import { IConnect, IConnected } from "@microsoft/fluid-driver-base";
import {
    ConnectionMode,
    IClient,
    IDocumentMessage,
    IDocumentSystemMessage,
    ISignalMessage,
    ITokenClaims,
    MessageType,
} from "@microsoft/fluid-protocol-definitions";
import * as agent from "@microsoft/fluid-server-agent";
import { canSummarize, canWrite } from "@microsoft/fluid-server-services-client";
import * as core from "@microsoft/fluid-server-services-core";
import {
    createNackMessage,
    createRoomJoinMessage,
    createRoomLeaveMessage,
    generateClientId,
    getRandomInt,
} from "@microsoft/fluid-server-services-utils";
import * as jwt from "jsonwebtoken";
import * as semver from "semver";
import * as winston from "winston";
import { DefaultServiceConfiguration } from "./utils";

interface IRoom {

    tenantId: string;

    documentId: string;
}

interface IConnectedClient {

    connection: IConnected;

    details: IClient;

    connectVersions: string[];
}

function getRoomId(room: IRoom) {
    return `${room.tenantId}/${room.documentId}`;
}

// Sanitize the receeived op before sending.
function sanitizeMessage(message: any): IDocumentMessage {
    // Trace sampling.
    if (getRandomInt(100) === 0 && message.operation && message.operation.traces) {
        message.operation.traces.push(
            {
                action: "start",
                service: "alfred",
                timestamp: Date.now(),
            });
    }
    const sanitizedMessage: IDocumentMessage = {
        clientSequenceNumber: message.clientSequenceNumber,
        contents: message.contents,
        metadata: message.metadata,
        referenceSequenceNumber: message.referenceSequenceNumber,
        traces: message.traces,
        type: message.type,
    };

    if (isSystemType(sanitizedMessage.type)) {
        const systemMessage = sanitizedMessage as IDocumentSystemMessage;
        systemMessage.data = message.data;
        return systemMessage;
    } else {
        return sanitizedMessage;
    }
}

const protocolVersions = ["^0.3.0", "^0.2.0", "^0.1.0"];

function selectProtocolVersion(connectVersions: string[]): string {
    let version: string = null;
    for (const connectVersion of connectVersions) {
        for (const protocolVersion of protocolVersions) {
            if (semver.intersects(protocolVersion, connectVersion)) {
                version = protocolVersion;
                return version;
            }
        }
    }
}

export function register(
    webSocketServer: core.IWebSocketServer,
    metricClientConfig: any,
    orderManager: core.IOrdererManager,
    tenantManager: core.ITenantManager,
    storage: core.IDocumentStorage,
    contentCollection: core.ICollection<any>,
    clientManager: core.IClientManager) {

    // TODO register should take the metric client as a param
    const metricLogger = agent.createMetricClient(metricClientConfig);

    webSocketServer.on("connection", (socket: core.IWebSocket) => {
        // Map from client IDs on this connection to the object ID and user info.
        const connectionsMap = new Map<string, core.IOrdererConnection>();
        // Map from client IDs to room.
        const roomMap = new Map<string, IRoom>();

        // back-compat map for storing clientIds with latest protocol versions.
        const versionMap = new Set<string>();

        function isWriter(scopes: string[], existing: boolean, mode: ConnectionMode): boolean {
            if (canWrite(scopes) || canSummarize(scopes)) {
                // New document needs a writer to boot.
                if (!existing) {
                    return true;
                } else {
                    // back-compat for old client and new server.
                    if (mode === undefined) {
                        return true;
                    } else {
                        return mode === "write";
                    }
                }
            } else {
                return false;
            }
        }

        // back-compat for old clients not having protocol version ^0.3.0
        function canSendMessage(connectVersions: string[]) {
            return connectVersions.indexOf("^0.3.0") !== -1;
        }

        async function connectDocument(message: IConnect): Promise<IConnectedClient> {
            if (!message.token) {
                return Promise.reject("Must provide an authorization token");
            }

            // Validate token signature and claims
            const token = message.token;
            const claims = jwt.decode(token) as ITokenClaims;
            if (claims.documentId !== message.id || claims.tenantId !== message.tenantId) {
                return Promise.reject("Invalid claims");
            }
            await tenantManager.verifyToken(claims.tenantId, token);

            const clientId = generateClientId();
            const room: IRoom = {
                tenantId: claims.tenantId,
                documentId: claims.documentId,
            };

            // Subscribe to channels.
            await Promise.all([
                socket.join(getRoomId(room)),
                socket.join(`client#${clientId}`)]);

            // todo: should all the client details come from the claims???
            // we are still trusting the users permissions and type here.
            const messageClient: Partial<IClient> = message.client ? message.client : {};
            messageClient.user = claims.user;
            messageClient.scopes = claims.scopes;

            // Join the room to receive signals.
            roomMap.set(clientId, room);
            // Iterate over the version ranges provided by the client and select the best one that works
            const connectVersions = message.versions ? message.versions : ["^0.1.0"];
            const version = selectProtocolVersion(connectVersions);
            if (!version) {
                return Promise.reject(
                    `Unsupported client protocol.` +
                    `Server: ${protocolVersions}. ` +
                    `Client: ${JSON.stringify(connectVersions)}`);
            }

            const detailsP = storage.getOrCreateDocument(claims.tenantId, claims.documentId);
            const clientsP = clientManager.getClients(claims.tenantId, claims.documentId);
            const addP = clientManager.addClient(
                claims.tenantId,
                claims.documentId,
                clientId,
                messageClient as IClient);

            const [details, , clients] = await Promise.all([detailsP, addP, clientsP]);

            let connectedMessage: IConnected;
            if (isWriter(messageClient.scopes, details.existing, message.mode)) {
                const orderer = await orderManager.getOrderer(claims.tenantId, claims.documentId);
                const connection = await orderer.connect(socket, clientId, messageClient as IClient, details);
                connectionsMap.set(clientId, connection);

                // Eventually we will send disconnect reason as headers to client.
                connection.once("producerError", (error) => {
                    winston.info(`Disconnecting socket on connection error`, error);
                    socket.disconnect(true);
                });

                connectedMessage = {
                    claims,
                    clientId,
                    existing: details.existing,
                    maxMessageSize: connection.maxMessageSize,
                    mode: "write",
                    parentBranch: connection.parentBranch,
                    serviceConfiguration: connection.serviceConfiguration,
                    initialClients: clients,
                    supportedVersions: protocolVersions,
                    version,
                };
            } else {
                connectedMessage = {
                    claims,
                    clientId,
                    existing: details.existing,
                    maxMessageSize: 1024, // Readonly client can't send ops.
                    mode: "read",
                    parentBranch: null, // Does not matter for now.
                    serviceConfiguration: DefaultServiceConfiguration,
                    initialClients: clients,
                    supportedVersions: protocolVersions,
                    version,
                };
            }

            return {
                connection: connectedMessage,
                connectVersions,
                details: messageClient as IClient,
            };
        }

        // Note connect is a reserved socket.io word so we use connect_document to represent the connect request
        socket.on("connect_document", async (connectionMessage: IConnect) => {
            connectDocument(connectionMessage).then(
                (message) => {
                    socket.emit("connect_document_success", message.connection);
                    // back-compat for old clients.
                    if (canSendMessage(message.connectVersions)) {
                        versionMap.add(message.connection.clientId);
                        socket.emitToRoom(
                            getRoomId(roomMap.get(message.connection.clientId)),
                            "signal",
                            createRoomJoinMessage(message.connection.clientId, message.details));
                    }
                },
                (error) => {
                    winston.info(`connectDocument error`, error);
                    socket.emit("connect_document_error", error);
                });
        });

        // Message sent when a new operation is submitted to the router
        socket.on(
            "submitOp",
            (clientId: string, messageBatches: (IDocumentMessage | IDocumentMessage[])[], response) => {
                // Verify the user has an orderer connection.
                if (!connectionsMap.has(clientId)) {
                    socket.emit("nack", "", [createNackMessage()]);
                } else {
                    const connection = connectionsMap.get(clientId);

                    messageBatches.forEach((messageBatch) => {
                        const messages = Array.isArray(messageBatch) ? messageBatch : [messageBatch];
                        const sanitized = messages
                            .filter((message) => {
                                if (message.type === MessageType.RoundTrip) {
                                    // End of tracking. Write traces.
                                    metricLogger.writeLatencyMetric("latency", message.traces).catch(
                                        (error) => {
                                            winston.error(error.stack);
                                        });
                                    return false;
                                } else {
                                    return true;
                                }
                            })
                            .map((message) => sanitizeMessage(message));

                        if (sanitized.length > 0) {
                            connection.order(sanitized);
                        }
                    });

                    // A response callback used to be used to verify the send. Newer drivers do not use this. Will be
                    // removed in 0.9
                    if (response) {
                        response(null);
                    }
                }
            });

        // Message sent when a new signal is submitted to the router
        socket.on(
            "submitSignal",
            (clientId: string, contentBatches: (IDocumentMessage | IDocumentMessage[])[], response) => {
                // Verify the user has subscription to the room.
                if (!roomMap.has(clientId)) {
                    return response("Invalid client ID", null);
                }

                contentBatches.forEach((contentBatche) => {
                    const contents = Array.isArray(contentBatche) ? contentBatche : [contentBatche];

                    for (const content of contents) {
                        const signalMessage: ISignalMessage = {
                            clientId,
                            content,
                        };

                        socket.emitToRoom(getRoomId(roomMap.get(clientId)), "signal", signalMessage);
                    }
                });

                // A response callback used to be used to verify the send. Newer drivers do not use this.
                // Will be removed in 0.9
                if (response) {
                    response(null);
                }
            });

        socket.on("disconnect", async () => {
            // Send notification messages for all client IDs in the connection map
            for (const [clientId, connection] of connectionsMap) {
                winston.info(`Disconnect of ${clientId}`);
                connection.disconnect();
            }
            // Send notification messages for all client IDs in the room map
            const removeP = [];
            for (const [clientId, room] of roomMap) {
                winston.info(`Disconnect of ${clientId} from room`);
                removeP.push(clientManager.removeClient(room.tenantId, room.documentId, clientId));
                // back-compat check for older clients.
                if (versionMap.has(clientId)) {
                    socket.emitToRoom(getRoomId(room), "signal", createRoomLeaveMessage(clientId));
                }
            }
            await Promise.all(removeP);
        });
    });
}
