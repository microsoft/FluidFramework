import * as _ from "lodash";
import * as moniker from "moniker";
import * as nconf from "nconf";
import * as redis from "redis";
import * as socketIo from "socket.io";
import * as socketIoRedis from "socket.io-redis";
import * as api from "../api";
import * as core from "../core";
import * as socketStorage from "../socket-storage";
import * as utils from "../utils";
import { logger } from "../utils";
import * as storage from "./storage";

let io = socketIo();

// Group this into some kind of an interface
const kafkaEndpoint = nconf.get("kafka:lib:endpoint");
const kafkaLibrary = nconf.get("kafka:lib:name");
const kafkaClientId = nconf.get("alfred:kafkaClientId");
const topic = nconf.get("alfred:topic");

const historian = nconf.get("git:historian");
const historianBranch = nconf.get("git:repository");

// Setup redis
let host = nconf.get("redis:host");
let port = nconf.get("redis:port");
let pass = nconf.get("redis:pass");

let options: any = { auth_pass: pass };
if (nconf.get("redis:tls")) {
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
const mongoUrl = nconf.get("mongo:endpoint");
const documentsCollectionName = nconf.get("mongo:collectionNames:documents");

const mongoManager = new utils.MongoManager(mongoUrl);

// Producer used to publish messages
const producer = utils.kafkaProducer.create(kafkaLibrary, kafkaEndpoint, kafkaClientId, topic);
const throughput = new utils.ThroughputCounter(logger.info);

io.on("connection", (socket) => {
    const connectionProfiler = logger.startTimer();
    connectionProfiler.logger.info(`New socket.io connection`);

    // Map from client IDs on this connection to the object ID for them
    const connectionsMap: { [clientId: string]: string } = {};

    // Note connect is a reserved socket.io word so we use connectDocument to represent the connect request
    socket.on("connectDocument", (message: socketStorage.IConnect, response) => {
        // Join the room first to ensure the client will start receiving delta updates
        const profiler = logger.startTimer();
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

                    const clientId = moniker.choose();
                    connectionsMap[clientId] = message.id;

                    const encrypted = documentDetails.docPrivateKey ? true : false;

                    const connectedMessage: socketStorage.IConnected = {
                        clientId,
                        distributedObjects: documentDetails.distributedObjects,
                        encrypted,
                        existing: documentDetails.existing,
                        minimumSequenceNumber: documentDetails.minimumSequenceNumber,
                        pendingDeltas: documentDetails.pendingDeltas,
                        privateKey: documentDetails.docPrivateKey,
                        publicKey: documentDetails.docPublicKey,
                        sequenceNumber: documentDetails.sequenceNumber,
                        transformedMessages: documentDetails.transformedMessages,
                        version: documentDetails.version,
                    };

                    profiler.done(`Loaded ${message.id}`);
                    response(null, connectedMessage);
                });
            }, (error) => {
                logger.error("Error fetching", error);
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
                logger.error(error);
                response(error, null);
                throughput.acknolwedge();
            });
    });

    // Message sent when a shadow client wants to collaborate on the document.
    socket.on("connectShadowClient", (message: socketStorage.IConnect, response) => {
        logger.info(`Shadow client has requested to collaborate on ${message.id}`);

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

                    const clientId = moniker.choose();
                    connectionsMap[clientId] = message.id;

                    const connectedMessage: socketStorage.IShadowConnected = {
                        clientId,
                    };
                    response(null, connectedMessage);
                });
            }, (error) => {
                logger.error("Error fetching", error);
                response(error, null);
            });
    });

});

export default io;
