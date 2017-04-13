import { Client } from "azure-event-hubs";
import * as azureStorage from "azure-storage";
import * as _ from "lodash";
import { MongoClient } from "mongodb";
import * as nconf from "nconf";
import * as redis from "redis";
import * as socketIo from "socket.io";
import * as socketIoRedis from "socket.io-redis";
import * as api from "../api";
import * as socketStorage from "../socket-storage";
import * as utils from "../utils";

let io = socketIo();

// Configure access to the event hub
const rawDeltasConfig = nconf.get("eventHub:raw-deltas");
const connectionString = utils.getEventHubConnectionString(rawDeltasConfig.endpoint, rawDeltasConfig.send);

let client = Client.fromConnectionString(connectionString, rawDeltasConfig.entityPath);
let senderP = client.open().then(() => client.createSender());

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

// Connect to the database
const mongoUrl = nconf.get("mongo:endpoint");
const mongoClientP = MongoClient.connect(mongoUrl);
const collectionP = mongoClientP.then(async (db) => {
    const deltasCollectionName = nconf.get("mongo:collectionNames:deltas");
    const collection = db.collection(deltasCollectionName);
    return collection;
});

// Gain access to the document storage
const blobStorageConnectionString = nconf.get("blobStorage:connectionString");
const snapshotContainer = nconf.get("blobStorage:containers:snapshots");
const blobStorage = azureStorage.createBlobService(blobStorageConnectionString);

// Get Mongo access to grab pending snapshots

io.on("connection", (socket) => {
    // The loadObject call needs to see if the object already exists. If not it should offload to
    // the storage service to go and create it.
    //
    // If it does exist it should query that same service to pull in the current snapshot.
    //
    // Given a client is then going to send us deltas on that service we need routerlicious to kick in as well.
    socket.on("loadObject", (message: socketStorage.ILoadObjectMessage, response) => {
        // Join the room first to ensure the client will start receiving delta updates
        console.log(`Client has requested to load ${message.objectId}`);
        socket.join(message.objectId, (joinError) => {
            if (joinError) {
                return response({ error: joinError });
            }

            // Now grab the snapshot, any deltas post snapshot, and send to the client
            blobStorage.getBlobToText(snapshotContainer, message.objectId, async (error, text) => {
                let snapshot: api.ICollaborativeObjectSnapshot;

                // TODO need to distinguish no blob vs. error
                if (error && (<any> error).code !== "BlobNotFound") {
                    response({ error });
                    return;
                }

                if (error) {
                    snapshot = {
                        sequenceNumber: 0,
                        snapshot: {},
                    };
                } else {
                    snapshot = JSON.parse(text);
                }

                const collection = await collectionP;
                const deltas = await collection
                    .find({ objectId: message.objectId, sequenceNumber: { $gt: snapshot.sequenceNumber } })
                    .sort({ sequenceNumber: 1 })
                    .toArray();
                console.log("Found outstanding deltas");
                console.log(JSON.stringify(deltas, null, 2));

                const responseMessage: socketStorage.IResponse<socketStorage.IObjectDetails> = {
                    data: {
                        deltas,
                        id: message.objectId,
                        sequenceNumber: snapshot.sequenceNumber,
                        snapshot: snapshot.snapshot,
                        type: message.type,
                    },
                    error: null,
                };

                response(responseMessage);
            });
        });
    });

    // Message sent when a new operation is submitted to the router
    socket.on("submitOp", (message: socketStorage.ISubmitOpMessage, response) => {
        senderP.then((sender) => {
            console.log(`Operation received for object ${message.objectId}`);
            const responseMessage: socketStorage.IResponse<boolean> = {
                data: true,
                error: null,
            };

            // TODO we either want to ack each send or ack a group of them later on
            // Place the message in the routerlicious queue for sequence number generation
            sender.send(message, message.objectId);

            // Notify the client of receipt
            response(responseMessage);
        });
    });
});

export default io;
