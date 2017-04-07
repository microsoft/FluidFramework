import { Client } from "azure-event-hubs";
import { Collection, MongoClient } from "mongodb";
import * as nconf from "nconf";
import * as path from "path";
import * as socketIoEmitter from "socket.io-emitter";
import * as socketStorage from "../socket-storage";
import * as utils from "../utils";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// Initialize Socket.io and connect to the Redis adapter
// TODO put in the extra stuff here
let host = nconf.get("redis:host");
let port = nconf.get("redis:port");

let io = socketIoEmitter(({ host, port }));
io.redis.on("error", (error) => {
    console.error(error);
});

// Connect to the database
const mongoUrl = nconf.get("mongo:endpoint");
const mongoClientP = MongoClient.connect(mongoUrl);
const collectionP = mongoClientP.then(async (db) => {
    const deltasCollectionName = nconf.get("mongo:collectionNames:deltas");
    const collection = db.collection(deltasCollectionName);

    // TODO remove once we've stabalized
    await collection.drop();

    const indexP = collection.createIndex({
            objectId: 1,
            sequenceNumber: 1,
        },
        { unique: true });

    await indexP;
    return collection;
});

// Configure access to the event hub where we'll send sequenced packets
const deltasConfig = nconf.get("eventHub:deltas");
const deltasConnectionString = utils.getEventHubConnectionString(deltasConfig.endpoint, deltasConfig.listen);
const client = Client.fromConnectionString(deltasConnectionString, deltasConfig.entityPath);
const consumerGroup = nconf.get("scriptorium:consumerGroup");

async function processMessage(message: socketStorage.IRoutedOpMessage, db: Collection): Promise<void> {
    // Serialize the message to backing store
    console.log(`Inserting to mongodb`);
    db.insert(message).catch((error) => {
        console.error(error);
    });

    // Route the message to clients
    console.log(`Routing message to clients`);
    io.to(message.objectId).emit("op", message);
}

async function listenForMessages(receiveClient: Client, id: string) {
    const deltas = await collectionP;

    // TODO I'm limiting to messages after now - which we'll want to remove once we have proper checkpointing
    receiveClient.createReceiver(consumerGroup, id, { startAfterTime: Date.now() }).then((receiver) => {
        console.log(`Receiver created for partition ${id}`);
        receiver.on("errorReceived", (error) => {
            console.log(error);
        });

        receiver.on("message", (message) => {
            console.log(`${id}: Key ${message.partitionKey} Seq# ${message.body.sequenceNumber}`);
            processMessage(message.body, deltas);
        });

        console.log("Listening");
    });
}

client.open().then(() => {
    client.getPartitionIds().then((ids) => {
        for (const id of ids) {
            listenForMessages(client, id);
        }
    });
});
