import * as agent from "@prague/agent";
import * as api from "@prague/client-api";
import {
    IClient,
    IContentMessage,
    IDocumentMessage,
    IDocumentSystemMessage,
    ISignalMessage,
    ITokenClaims,
} from "@prague/container-definitions";
import * as core from "@prague/services-core";
import { generateClientId, getRandomInt } from "@prague/services-utils";
import { IConnect, IConnected } from "@prague/socket-storage-shared";
import { isSystemType } from "@prague/utils";
import * as jwt from "jsonwebtoken";
import * as semver from "semver";
import * as winston from "winston";

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

const protocolVersion = "^0.1.0";

export function register(
    webSocketServer: core.IWebSocketServer,
    metricClientConfig: any,
    orderManager: core.IOrdererManager,
    tenantManager: core.ITenantManager,
    contentCollection: core.ICollection<any>) {

    const metricLogger = agent.createMetricClient(metricClientConfig);

    webSocketServer.on("connection", (socket: core.IWebSocket) => {
        // Map from client IDs on this connection to the object ID and user info.
        const connectionsMap = new Map<string, core.IOrdererConnection>();
        // Map from client IDs to room.
        const roomMap = new Map<string, string>();

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

            // todo: should all the client details come from the claims???
            // we are still trusting the users permissions and type here.
            const messageClient: Partial<IClient> = message.client ? message.client : {};
            messageClient.user = claims.user;

            // Join the room to receive signals.
            roomMap.set(clientId, `${claims.tenantId}/${claims.documentId}`);

            // Iterate over the version ranges provided by the client and select the best one that works
            const connectVersions = message.versions ? message.versions : ["^0.1.0"];
            let version: string = null;
            for (const connectVersion of connectVersions) {
                if (semver.intersects(protocolVersion, connectVersion)) {
                    version = protocolVersion;
                    break;
                }
            }

            if (!version) {
                return Promise.reject(
                    `Unsupported client protocol.` +
                    `Server: ${protocolVersion}. ` +
                    `Client: ${JSON.stringify(connectVersions)}`);
            }

            // Readonly clients don't need an orderer.
            if (messageClient.mode !== "readonly") {
                const orderer = await orderManager.getOrderer(claims.tenantId, claims.documentId);
                const connection = await orderer.connect(socket, clientId, messageClient as IClient);
                connectionsMap.set(clientId, connection);

                const connectedMessage: IConnected = {
                    clientId,
                    existing: connection.existing,
                    maxMessageSize: connection.maxMessageSize,
                    parentBranch: connection.parentBranch,
                    supportedVersions: [protocolVersion],
                    version,
                };

                return connectedMessage;
            } else {
                // TODO: We should split storage stuff from orderer to get the following fields right.
                const connectedMessage: IConnected = {
                    clientId,
                    existing: true, // Readonly client can only open an existing document.
                    maxMessageSize: 1024, // Readonly client can't send ops.
                    parentBranch: null, // Does not matter for now.
                    supportedVersions: [protocolVersion],
                    version,
                };

                return connectedMessage;
            }
        }

        // Note connect is a reserved socket.io word so we use connect_document to represent the connect request
        socket.on("connect_document", async (message: IConnect) => {
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
        socket.on("submitOp", (clientId: string, messages: IDocumentMessage[], response) => {
            // TODO validate message size within bounds

            // Verify the user has an orderer connection.
            if (!connectionsMap.has(clientId)) {
                return response("Invalid client ID or readonly client", null);
            }

            const connection = connectionsMap.get(clientId);

            for (const message of messages) {
                if (message.type === api.RoundTrip) {
                    // End of tracking. Write traces.
                    metricLogger.writeLatencyMetric("latency", message.traces).catch(
                        (error) => {
                            winston.error(error.stack);
                        });
                } else {
                    connection.order(sanitizeMessage(message));
                }
            }

            response(null);
        });

        // Message sent when a new splitted operation is submitted to the router
        socket.on("submitContent", (clientId: string, message: IDocumentMessage, response) => {
            // Verify the user has an orderer connection.
            if (!connectionsMap.has(clientId)) {
                return response("Invalid client ID or readonly client", null);
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

            contentCollection.insertOne(dbMessage).then(() => {
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
        socket.on("submitSignal", (clientId: string, contents: any[], response) => {
            // Verify the user has an orderer connection and subscription to the room.
            if (!connectionsMap.has(clientId) || !roomMap.has(clientId)) {
                return response("Invalid client ID or readonly client", null);
            }

            const roomId = roomMap.get(clientId);

            for (const content of contents) {
                const signalMessage: ISignalMessage = {
                    clientId,
                    content,
                };

                socket.emitToRoom(roomId, "signal", signalMessage);
            }

            response(null);
        });

        socket.on("disconnect", () => {
            // Send notification messages for all client IDs in the connection map
            for (const [clientId, connection] of connectionsMap) {
                winston.info(`Disconnect of ${clientId}`);
                connection.disconnect();
            }
        });
    });
}
