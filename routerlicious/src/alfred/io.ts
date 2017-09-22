import * as moniker from "moniker";
import { Provider } from "nconf";
import * as winston from "winston";
import * as api from "../api";
import * as core from "../core";
import * as socketStorage from "../socket-storage";
import * as utils from "../utils";
import * as storage from "./storage";

export function register(
    webSocketServer: core.IWebSocketServer,
    config: Provider,
    mongoManager: utils.MongoManager,
    producer: utils.kafkaProducer.IProducer,
    documentsCollectionName: string) {

    const throughput = new utils.ThroughputCounter(winston.info);

    webSocketServer.on("connection", (socket: core.IWebSocket) => {
        const connectionProfiler = winston.startTimer();
        connectionProfiler.logger.info(`New socket.io connection`);

        // Map from client IDs on this connection to the object ID for them
        const connectionsMap: { [clientId: string]: string } = {};

        // Note connect is a reserved socket.io word so we use connectDocument to represent the connect request
        socket.on("connectDocument", (message: socketStorage.IConnect, response) => {
            // Join the room first to ensure the client will start receiving delta updates
            const profiler = winston.startTimer();
            connectionProfiler.done(`Client has requested to load ${message.id}`);

            /**
             * NOTE: Should there be an extra check to verify that if 'encrypted' is false, the passed keys are empty?
             * Food for thought: what should the correct behavior be if someone requests an encrypted connection to a
             * document that mongoDB has marked as unencrypted (or vice-versa)?
             */

            const documentDetailsP = storage.getOrCreateDocument(
                mongoManager,
                documentsCollectionName,
                message.id,
                message.privateKey,
                message.publicKey);

            documentDetailsP.then(
                (documentDetails) => {
                    socket.join(message.id).then(
                        () => {
                            const clientId = moniker.choose();
                            connectionsMap[clientId] = message.id;

                            const encrypted = documentDetails.docPrivateKey ? true : false;

                            const connectedMessage: socketStorage.IConnected = {
                                clientId,
                                encrypted,
                                existing: documentDetails.existing,
                                privateKey: documentDetails.docPrivateKey,
                                publicKey: documentDetails.docPublicKey,
                            };

                            profiler.done(`Loaded ${message.id}`);
                            response(null, connectedMessage);
                        },
                        (error) => {
                            return response(error, null);
                        });
                }, (error) => {
                    winston.error("Error fetching", error);
                    response(error, null);
                });
        });

        // Message sent when a new operation is submitted to the router
        socket.on("submitOp", (clientId: string, message: api.IDocumentMessage, response) => {
            // Verify the user has connected on this object id
            if (!connectionsMap[clientId]) {
                return response("Invalid client ID", null);
            }

            const documentId = connectionsMap[clientId];
            const rawMessage: core.IRawOperationMessage = {
                clientId,
                documentId,
                operation: message,
                timestamp: Date.now(),
                type: core.RawOperationType,
                userId: null,
            };

            throughput.produce();
            producer.send(JSON.stringify(rawMessage), documentId).then(
                (responseMessage) => {
                    response(null, responseMessage);
                    throughput.acknolwedge();
                },
                (error) => {
                    winston.error(error);
                    response(error, null);
                    throughput.acknolwedge();
                });
        });
    });
}
