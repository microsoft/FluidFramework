import * as api from "@prague/routerlicious/dist/api-core";
import * as core from "@prague/routerlicious/dist/core";
import { ThroughputCounter } from "@prague/routerlicious/dist/core-utils";
import * as socketStorage from "@prague/routerlicious/dist/socket-storage";
import * as jwt from "jsonwebtoken";
import * as moniker from "moniker";
import { Provider } from "nconf";
import * as winston from "winston";

interface IDocumentUser {
    tenantId: string;

    documentId: string;

    user: api.ITenantUser;

    permission: string;
}

export function register(webSocketServer: core.IWebSocketServer, config: Provider) {
    const throughput = new ThroughputCounter(winston.info);

    webSocketServer.on("connection", (socket: core.IWebSocket) => {
        const connectionProfiler = winston.startTimer();
        connectionProfiler.logger.info(`New socket.io connection`);

        // Map from client IDs on this connection to the object ID and user info.
        const connectionsMap = new Map<string, IDocumentUser>();

        async function sendAndTrack(message: core.IRawOperationMessage) {
            throughput.produce();
            // Send to the BC here
            // const sendP = producer.send(JSON.stringify(message), message.documentId);
            // sendP.catch((error) => { return; }).then(() => throughput.acknowlwedge());
            // return sendP;
            return;
        }

        async function connectDocument(message: socketStorage.IConnect): Promise<socketStorage.IConnected> {
            if (!message.token) {
                return Promise.reject("Must provide an authorization token");
            }

            const token = message.token;

            // Validate token signature and claims
            const claims = jwt.decode(token) as api.ITokenClaims;
            // if (claims.documentId !== message.id || claims.tenantId !== message.tenantId) {
            //     return Promise.reject("Invalid claims");
            // }

            // const documentDetails = await storage.getOrCreateDocument(
            //     mongoManager,
            //     documentsCollectionName,
            //     producer,
            //     message.tenantId,
            //     message.id);
            const documentDetails = { existing: false };

            const clientId = moniker.choose();
            await Promise.all(
                [socket.join(`${claims.tenantId}/${claims.documentId}`), socket.join(`client#${clientId}`)]);

            // Create and set a new client ID
            connectionsMap.set(
                clientId,
                {
                    documentId: message.id,
                    permission: claims.permission,
                    tenantId: message.tenantId,
                    user: claims.user,
                });

            // Broadcast the client connection message
            const rawMessage: core.IRawOperationMessage = {
                clientId: null,
                documentId: message.id,
                operation: {
                    clientSequenceNumber: -1,
                    contents: clientId,
                    referenceSequenceNumber: -1,
                    traces: [],
                    type: api.ClientJoin,
                },
                tenantId: message.tenantId,
                timestamp: Date.now(),
                type: core.RawOperationType,
                user: claims.user,
            };
            sendAndTrack(rawMessage);

            const parentBranch = null;

            // And return the connection information to the client
            const connectedMessage: socketStorage.IConnected = {
                clientId,
                existing: documentDetails.existing,
                parentBranch,
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
                    response(null, "Roundtrip message received");
                    continue;
                }

                const docUser = connectionsMap.get(clientId);
                const rawMessage: core.IRawOperationMessage = {
                    clientId,
                    documentId: docUser.documentId,
                    operation: message,
                    tenantId: docUser.tenantId,
                    timestamp: Date.now(),
                    type: core.RawOperationType,
                    user: docUser.user,
                };

                throughput.produce();

                // Add trace
                rawMessage.operation.traces.push( {service: "alfred", action: "start", timestamp: Date.now()} );

                sendAndTrack(rawMessage).then(
                    (responseMessage) => {
                        response(null, responseMessage);
                    },
                    (error) => {
                        winston.error(error);
                        response(error, null);
                    });
            }
        });

        socket.on("disconnect", () => {
            // Send notification messages for all client IDs in the connection map
            for (const [clientId, docUser] of connectionsMap) {
                winston.info(`Disconnect of ${clientId}`);

                const rawMessage: core.IRawOperationMessage = {
                    clientId: null,
                    documentId: docUser.documentId,
                    operation: {
                        clientSequenceNumber: -1,
                        contents: clientId,
                        referenceSequenceNumber: -1,
                        traces: [],
                        type: api.ClientLeave,
                    },
                    tenantId: docUser.tenantId,
                    timestamp: Date.now(),
                    type: core.RawOperationType,
                    user: docUser.user,
                };

                sendAndTrack(rawMessage);
            }
        });
    });
}
