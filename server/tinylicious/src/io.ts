/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { isSystemType } from "@microsoft/fluid-protocol-base";
import {
    ConnectionMode,
    IClient,
    IConnect,
    IConnected,
    IContentMessage,
    IDocumentMessage,
    IDocumentSystemMessage,
    INack,
    ISignalMessage,
    ITokenClaims,
} from "@microsoft/fluid-protocol-definitions";
import { canSummarize, canWrite } from "@microsoft/fluid-server-services-client";
import * as core from "@microsoft/fluid-server-services-core";
import { generateClientId, getRandomInt } from "@microsoft/fluid-server-services-utils";
import * as jwt from "jsonwebtoken";
import * as semver from "semver";
import * as winston from "winston";
import { DefaultServiceConfiguration } from "./utils";

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

const protocolVersions = ["^0.2.0", "^0.1.0"];

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
    orderManager: core.IOrdererManager,
    tenantManager: core.ITenantManager,
    storage: core.IDocumentStorage,
    contentCollection: core.ICollection<any>,
) {
    webSocketServer.on("connection", (socket: core.IWebSocket) => {
        // Map from client IDs on this connection to the object ID and user info.
        const connectionsMap = new Map<string, core.IOrdererConnection>();
        // Map from client IDs to room.
        const roomMap = new Map<string, string>();

        function isWriter(scopes: string[], existing: boolean, mode: ConnectionMode): boolean {
            if (canWrite(scopes) || canSummarize(scopes)) {
                // New document needs a writer to boot.
                if (!existing) {
                    return true;
                } else {
                    // Back-compat for old client and new server.
                    return mode === undefined ? true : mode === "write";
                }
            } else {
                return false;
            }
        }

        // For easy transition, we are reusing the same nack format sent by broadcaster.
        // TODO: Create a separate nack format.
        function createNackMessage(): INack {
            return {
                operation: undefined,
                sequenceNumber: -1,
            };
        }

        async function connectDocument(message: IConnect): Promise<IConnected> {
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

            // Subscribe to channels.
            await Promise.all([
                socket.join(`${claims.tenantId}/${claims.documentId}`),
                socket.join(`client#${clientId}`)]);

            // Todo: should all the client details come from the claims???
            // we are still trusting the users permissions and type here.
            const messageClient: Partial<IClient> = message.client ? message.client : {};
            messageClient.user = claims.user;
            messageClient.scopes = claims.scopes;

            // Join the room to receive signals.
            roomMap.set(clientId, `${claims.tenantId}/${claims.documentId}`);

            // Iterate over the version ranges provided by the client and select the best one that works
            const connectVersions = message.versions ? message.versions : ["^0.1.0"];
            const version = selectProtocolVersion(connectVersions);
            if (!version) {
                return Promise.reject(
                    `Unsupported client protocol.` +
                    `Server: ${protocolVersions}. ` +
                    `Client: ${JSON.stringify(connectVersions)}`);
            }

            const details = await storage.getOrCreateDocument(claims.tenantId, claims.documentId);

            if (isWriter(messageClient.scopes, details.existing, message.mode)) {
                const orderer = await orderManager.getOrderer(claims.tenantId, claims.documentId);
                const connection = await orderer.connect(socket, clientId, messageClient as IClient, details);
                connectionsMap.set(clientId, connection);

                const connectedMessage: IConnected = {
                    claims,
                    clientId,
                    existing: details.existing,
                    maxMessageSize: connection.maxMessageSize,
                    mode: "write",
                    parentBranch: connection.parentBranch,
                    serviceConfiguration: connection.serviceConfiguration,
                    supportedVersions: protocolVersions,
                    version,
                };

                return connectedMessage;
            } else {
                const connectedMessage: IConnected = {
                    claims,
                    clientId,
                    existing: details.existing,
                    maxMessageSize: 1024, // Readonly client can't send ops.
                    mode: "read",
                    parentBranch: null, // Does not matter for now.
                    serviceConfiguration: DefaultServiceConfiguration,
                    supportedVersions: protocolVersions,
                    version,
                };

                return connectedMessage;
            }
        }

        // Note connect is a reserved socket.io word so we use connect_document to represent the connect request
        socket.on("connect_document", (message: IConnect) => {
            connectDocument(message).then(
                (connectedMessage) => {
                    socket.emit("connect_document_success", connectedMessage);
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
                // Verify the client ID is associated with the connection
                if (!connectionsMap.has(clientId)) {
                    return socket.emit("nack", "", [createNackMessage()]);
                }

                const connection = connectionsMap.get(clientId);
                messageBatches.forEach((messageBatch) => {
                    const messages = Array.isArray(messageBatch) ? messageBatch : [messageBatch];
                    const sanitized = messages.map(sanitizeMessage);

                    if (sanitized.length > 0) {
                        connection.order(sanitized);
                    }
                });
            });

        // Message sent when a new splitted operation is submitted to the router
        socket.on(
            "submitContent",
            (clientId: string, message: IDocumentMessage, response) => {
                // Verify the client ID is associated with the connection
                if (!connectionsMap.has(clientId)) {
                    return socket.emit("nack", "", [createNackMessage()]);
                }

                const broadCastMessage: IContentMessage = {
                    clientId,
                    clientSequenceNumber: message.clientSequenceNumber,
                    contents: message.contents,
                };

                const connection = connectionsMap.get(clientId);

                const dbMessage = {
                    clientId,
                    documentId: connection.documentId,
                    op: broadCastMessage,
                    tenantId: connection.tenantId,
                };

                contentCollection.insertOne(dbMessage).then(
                    () => {
                        socket.broadcastToRoom(roomMap.get(clientId), "op-content", broadCastMessage);
                        return response(null);
                    }, (error) => {
                        if (error.code !== 11000) {
                            // Needs to be a full rejection here
                            return response("Could not write to DB", null);
                        }
                    });
            });

        // Message sent when a new signal is submitted to the router
        socket.on(
            "submitSignal",
            (clientId: string, contentBatches: (IDocumentMessage | IDocumentMessage[])[], response) => {
                // Verify the user has subscription to the room.
                if (!roomMap.has(clientId)) {
                    return response("Invalid client ID", null);
                }

                const roomId = roomMap.get(clientId);

                contentBatches.forEach((contentBatche) => {
                    const contents = Array.isArray(contentBatche) ? contentBatche : [contentBatche];

                    for (const content of contents) {
                        const signalMessage: ISignalMessage = {
                            clientId,
                            content,
                        };

                        socket.emitToRoom(roomId, "signal", signalMessage);
                    }
                });
            });

        socket.on(
            "disconnect",
            () => {
                // Send notification messages for all client IDs in the connection map
                for (const [clientId, connection] of connectionsMap) {
                    winston.info(`Disconnect of ${clientId}`);
                    connection.disconnect();
                }
            });
    });
}
