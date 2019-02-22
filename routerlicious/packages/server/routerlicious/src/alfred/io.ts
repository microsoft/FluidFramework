import * as agent from "@prague/agent";
import * as api from "@prague/client-api";
import {
    IClient,
    IContentMessage,
    IDocumentMessage,
    IDocumentSystemMessage,
    ITokenClaims,
} from "@prague/container-definitions";
import * as socketStorage from "@prague/routerlicious-socket-storage";
import * as core from "@prague/services-core";
import { getRandomInt } from "@prague/services-utils";
import { isSystemType } from "@prague/utils";
import * as jwt from "jsonwebtoken";
import * as winston from "winston";

// A safety mechanism to make sure that all outbound messages from alfred adheres to the permitted schema.
function sanitizeMessage(message: any): IDocumentMessage {
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
    // back-compat: Should be consolidated with other system messages.
    if (isSystemType(sanitizedMessage.type)) {
        const systemMessage = sanitizedMessage as IDocumentSystemMessage;
        systemMessage.data = message.data;
        return systemMessage;
    } else {
        return sanitizedMessage;
    }
}

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

        async function connectDocument(message: socketStorage.IConnect): Promise<socketStorage.IConnected> {
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

            // todo: should all the client details come from the claims???
            // we are still trusting the users permissions and type here.
            const messageClient: Partial<IClient> = message.client ? message.client : {};
            messageClient.user = claims.user;

            // And then connect to the orderer
            const orderer = await orderManager.getOrderer(claims.tenantId, claims.documentId);
            const connection = await orderer.connect(socket, messageClient as IClient);
            connectionsMap.set(connection.clientId, connection);

            // And return the connection information to the client
            const connectedMessage: socketStorage.IConnected = {
                clientId: connection.clientId,
                existing: connection.existing,
                maxMessageSize: connection.maxMessageSize,
                parentBranch: connection.parentBranch,
            };

            return connectedMessage;
        }

        // todo: remove this handler once clients onboard "connect_document"
        // Note connect is a reserved socket.io word so we use connectDocument to represent the connect request
        socket.on("connectDocument", async (message: socketStorage.IConnect, response) => {
            connectDocument(message).then(
                (connectedMessage) => {
                    response(null, connectedMessage);
                },
                (error) => {
                    winston.info(`connectDocument error`, error);
                    response(error, null);
                });
        });

        // Note connect is a reserved socket.io word so we use connect_document to represent the connect request
        socket.on("connect_document", async (message: socketStorage.IConnect) => {
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

            // Verify the user has connected on this object id
            if (!connectionsMap.has(clientId)) {
                return response("Invalid client ID", null);
            }

            for (const message of messages) {
                if (message.type === api.RoundTrip) {
                    // End of tracking. Write traces.
                    metricLogger.writeLatencyMetric("latency", message.traces).catch(
                        (error) => {
                            winston.error(error.stack);
                        });
                } else {
                    const connection = connectionsMap.get(clientId);
                    connection.order(sanitizeMessage(message));
                }
            }

            response(null);
        });

        // Message sent when a new splitted operation is submitted to the router
        socket.on("submitContent", (clientId: string, message: IDocumentMessage, response) => {
            // Verify the user has connected on this object id
            if (!connectionsMap.has(clientId)) {
                return response("Invalid client ID", null);
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
                socket.broadcast("op-content", broadCastMessage);
                return response(null);
            }, (error) => {
                if (error.code !== 11000) {
                    // Needs to be a full rejection here
                    return response("Could not write to DB", null);
                }
            });
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
