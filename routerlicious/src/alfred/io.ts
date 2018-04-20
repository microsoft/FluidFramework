import * as moniker from "moniker";
import { Provider } from "nconf";
import * as winston from "winston";
import * as agent from "../agent";
import * as api from "../api-core";
import * as core from "../core";
import { ThroughputCounter } from "../core-utils";
import * as socketStorage from "../socket-storage";
import * as utils from "../utils";
import * as storage from "./storage";

interface IDocumentUser {
    docId: string;

    user: api.IAuthenticatedUser;
}

export function register(
    webSocketServer: core.IWebSocketServer,
    config: Provider,
    mongoManager: utils.MongoManager,
    producer: utils.kafkaProducer.IProducer,
    documentsCollectionName: string,
    metricClientConfig: any,
    tenantManager: api.ITenantManager,
    defaultTenant: string) {

    const throughput = new ThroughputCounter(winston.info);
    const metricLogger = agent.createMetricClient(metricClientConfig);

    webSocketServer.on("connection", (socket: core.IWebSocket) => {
        const connectionProfiler = winston.startTimer();
        connectionProfiler.logger.info(`New socket.io connection`);

        // Map from client IDs on this connection to the object ID and user info.
        const connectionsMap = new Map<string, IDocumentUser>();

        function sendAndTrack(message: core.IRawOperationMessage) {
            throughput.produce();
            const sendP = producer.send(JSON.stringify(message), message.documentId);
            sendP.catch((error) => { return; }).then(() => throughput.acknolwedge());
            return sendP;
        }

        async function connectDocument(message: socketStorage.IConnect): Promise<socketStorage.IConnected> {
            // TODO if no token - sign a token against the default tenant with default claims
            const token = message.token
                ? message.token
                : utils.generateToken(tenantManager, defaultTenant);
            const authedUser = await verifyAuthToken(tenantManager, token);

            const profiler = winston.startTimer();
            connectionProfiler.done(`Client has requested to load ${message.id}`);
            const documentDetails = await storage.getOrCreateDocument(
                mongoManager,
                documentsCollectionName,
                producer,
                message.id);

            const clientId = moniker.choose();
            await Promise.all([socket.join(message.id), socket.join(`client#${clientId}`)]);

            // Create and set a new client ID
            connectionsMap.set(
                clientId,
                {
                    docId: message.id,
                    user: authedUser,
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
                timestamp: Date.now(),
                type: core.RawOperationType,
                user: authedUser,
            };
            sendAndTrack(rawMessage);

            const parentBranch = documentDetails.value.parent
                ? documentDetails.value.parent.id
                : null;

            // And return the connection information to the client
            const connectedMessage: socketStorage.IConnected = {
                clientId,
                existing: documentDetails.existing,
                parentBranch,
                user: authedUser,
            };
            profiler.done(`Loaded ${message.id}`);

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

            for (let message of messages) {
                if (message.type === api.RoundTrip) {
                    // End of tracking. Write traces.
                    if (message.traces !== undefined) {
                        metricLogger.writeLatencyMetric("latency", message.traces)
                        .catch((error) => {
                            winston.error(error.stack);
                        });
                    }
                    response(null, "Roundtrip message received");
                    continue;
                }

                const docUser = connectionsMap.get(clientId);
                const rawMessage: core.IRawOperationMessage = {
                    clientId,
                    documentId: docUser.docId,
                    operation: message,
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

        // Message sent when a ping operation is submitted to the router
        socket.on("pingObject", (message: api.IPingMessage, response) => {
            // Ack the unacked message.
            if (!message.acked) {
                message.acked = true;
                // return response(null, message);
                socket.send(message, "pingObject");
            } else {
                // Only write if the traces are correctly timestamped twice.
                if (message.traces !== undefined && message.traces.length === 2) {
                    metricLogger.writeLatencyMetric("pinglatency", message.traces)
                    .catch((error) => {
                        winston.error(error.stack);
                    });
                }
            }
        });

        socket.on("disconnect", () => {
            // Send notification messages for all client IDs in the connection map
            for (const [clientId, docUser] of connectionsMap) {
                winston.info(`Disconnect of ${clientId}`);

                const rawMessage: core.IRawOperationMessage = {
                    clientId: null,
                    documentId: docUser.docId,
                    operation: {
                        clientSequenceNumber: -1,
                        contents: clientId,
                        referenceSequenceNumber: -1,
                        traces: [],
                        type: api.ClientLeave,
                    },
                    timestamp: Date.now(),
                    type: core.RawOperationType,
                    user: docUser.user,
                };

                sendAndTrack(rawMessage);
            }
        });
    });
}
