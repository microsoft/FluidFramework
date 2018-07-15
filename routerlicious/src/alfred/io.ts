import * as jwt from "jsonwebtoken";
import * as winston from "winston";
import * as agent from "../agent";
import * as api from "../api-core";
import * as core from "../core";
import * as socketStorage from "../socket-storage";

export function register(
    webSocketServer: core.IWebSocketServer,
    metricClientConfig: any,
    orderManager: core.IOrdererManager,
    tenantManager: core.ITenantManager) {

    const metricLogger = agent.createMetricClient(metricClientConfig);

    webSocketServer.on("connection", (socket: core.IWebSocket) => {
        // Map from client IDs on this connection to the object ID and user info.
        const connectionsMap = new Map<string, core.IOrdererConnection>();

        async function connectDocument(message: socketStorage.IConnect): Promise<socketStorage.IConnected> {
            if (!message.token) {
                return Promise.reject("Must provide an authorization token");
            }

            const token = message.token;

            // Validate token signature and claims
            const claims = jwt.decode(token) as api.ITokenClaims;
            if (claims.documentId !== message.id || claims.tenantId !== message.tenantId) {
                return Promise.reject("Invalid claims");
            }
            await tenantManager.verifyToken(claims.tenantId, token);

            // And then connect to the orderer
            const orderer = await orderManager.getOrderer(claims.tenantId, claims.documentId);
            const connection = await orderer.connect(socket, claims.user, message.client);

            // store a lookup from the clientID of the connection to the connection itself
            connectionsMap.set(connection.clientId, connection);

            // And return the connection information to the client
            const connectedMessage: socketStorage.IConnected = {
                clientId: connection.clientId,
                existing: connection.existing,
                parentBranch: connection.parentBranch,
                user: claims.user,
            };

            return connectedMessage;
        }

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

        // Message sent when a new operation is submitted to the router
        socket.on("submitOp", (clientId: string, messages: api.IDocumentMessage[], response) => {
            // Verify the user has connected on this object id
            if (!connectionsMap.has(clientId)) {
                return response("Invalid client ID", null);
            }

            for (const message of messages) {
                if (message.type === api.RoundTrip) {
                    // End of tracking. Write traces.
                    if (message.traces !== undefined) {
                        metricLogger.writeLatencyMetric("latency", message.traces).catch(
                            (error) => {
                                winston.error(error.stack);
                            });
                    }
                } else {
                    const connection = connectionsMap.get(clientId);
                    connection.order(message);
                }
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
