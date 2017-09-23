import * as _ from "lodash";
import * as moniker from "moniker";
import { Provider } from "nconf";
import * as redis from "redis";
import * as socketIo from "socket.io";
import * as socketIoRedis from "socket.io-redis";
import * as winston from "winston";
import * as api from "../api";
import * as core from "../core";
import * as socketStorage from "../socket-storage";
import * as utils from "../utils";
import * as storage from "./storage";

export function create(config: Provider, mongoManager: utils.MongoManager) {
    let io = socketIo();

    // Group this into some kind of an interface
    const kafkaEndpoint = config.get("kafka:lib:endpoint");
    const kafkaLibrary = config.get("kafka:lib:name");
    const kafkaClientId = config.get("alfred:kafkaClientId");
    const topic = config.get("alfred:topic");

    const historian = config.get("git:historian");
    const historianBranch = config.get("git:repository");

    // Setup redis
    let host = config.get("redis:host");
    let port = config.get("redis:port");
    let pass = config.get("redis:pass");

    let options: any = { auth_pass: pass };
    if (config.get("redis:tls")) {
        options.tls = {
            servername: host,
        };
    }

    let pubOptions = _.clone(options);
    let subOptions = _.clone(options);

    let pub = redis.createClient(port, host, pubOptions);
    let sub = redis.createClient(port, host, subOptions);
    io.adapter(socketIoRedis({ pubClient: pub, subClient: sub }));

    // Connection to stored document details
    const documentsCollectionName = config.get("mongo:collectionNames:documents");

    // Producer used to publish messages
    const producer = utils.kafkaProducer.create(kafkaLibrary, kafkaEndpoint, kafkaClientId, topic);
    const throughput = new utils.ThroughputCounter(winston.info);

    io.on("connection", (socket) => {
        const connectionProfiler = winston.startTimer();
        connectionProfiler.logger.info(`New socket.io connection`);

        // Map from client IDs on this connection to the object ID for them
        const connectionsMap: { [clientId: string]: string } = {};

        function sendAndTrack(message: core.IRawOperationMessage) {
            throughput.produce();
            const sendP = producer.send(JSON.stringify(message), message.documentId);
            sendP.catch((error) => { return; }).then(() => throughput.acknolwedge());
            return sendP;
        }

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
                historian,
                historianBranch,
                mongoManager,
                documentsCollectionName,
                message.id,
                message.privateKey,
                message.publicKey);

            documentDetailsP.then(
                (documentDetails) => {
                    socket.join(message.id, (joinError) => {
                        if (joinError) {
                            return response(joinError, null);
                        }

                        // Create and set a new client ID
                        const clientId = moniker.choose();
                        connectionsMap[clientId] = message.id;

                        // Broadcast the client connection message
                        const rawMessage: core.IRawOperationMessage = {
                            clientId: null,
                            documentId: message.id,
                            operation: {
                                clientSequenceNumber: -1,
                                contents: clientId,
                                encrypted: false,
                                encryptedContents: null,
                                referenceSequenceNumber: -1,
                                type: api.ClientJoin,
                            },
                            timestamp: Date.now(),
                            type: core.RawOperationType,
                            userId: null,
                        };
                        sendAndTrack(rawMessage);

                        // And return the connection information to the client
                        const connectedMessage: socketStorage.IConnected = {
                            clientId,
                            encrypted: documentDetails.docPrivateKey ? true : false,
                            existing: documentDetails.existing,
                            privateKey: documentDetails.docPrivateKey,
                            publicKey: documentDetails.docPublicKey,
                        };
                        profiler.done(`Loaded ${message.id}`);
                        response(null, connectedMessage);
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
            sendAndTrack(rawMessage).then(
                (responseMessage) => {
                    response(null, responseMessage);
                },
                (error) => {
                    winston.error(error);
                    response(error, null);
                });
        });

        socket.on("disconnect", () => {
            // Send notification messages for all client IDs in the connection map
            // tslint:disable-next-line:forin
            for (const clientId in connectionsMap) {
                const documentId = connectionsMap[clientId];
                const rawMessage: core.IRawOperationMessage = {
                    clientId: null,
                    documentId,
                    operation: {
                        clientSequenceNumber: -1,
                        contents: clientId,
                        encrypted: false,
                        encryptedContents: null,
                        referenceSequenceNumber: -1,
                        type: api.ClientLeave,
                    },
                    timestamp: Date.now(),
                    type: core.RawOperationType,
                    userId: null,
                };

                sendAndTrack(rawMessage);
            }
        });
    });

    return io;
}
