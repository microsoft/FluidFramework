import { Client, Sender } from "azure-event-hubs";
import { Collection, MongoClient } from "mongodb";
import * as nconf from "nconf";
import * as path from "path";
import * as socketStorage from "../socket-storage";
import * as utils from "../utils";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// Configure access to the event hub
const rawDeltasConfig = nconf.get("eventHub:raw-deltas");
const rawDeltasConnectionString = utils.getEventHubConnectionString(rawDeltasConfig.endpoint, rawDeltasConfig.listen);
const receiveClient = Client.fromConnectionString(rawDeltasConnectionString, rawDeltasConfig.entityPath);
const consumerGroup = nconf.get("deli:consumerGroup");

// Configure access to the event hub where we'll send sequenced packets
const deltasConfig = nconf.get("eventHub:deltas");
const deltasConnectionString = utils.getEventHubConnectionString(deltasConfig.endpoint, deltasConfig.send);
const sendClient = Client.fromConnectionString(deltasConnectionString, deltasConfig.entityPath);
const senderP = sendClient.open().then(() => sendClient.createSender());

// Connect to the database and index on the objectId
const mongoUrl = nconf.get("mongo:endpoint");
const mongoClientP = MongoClient.connect(mongoUrl);

// const objectsCollectionP = mongoClientP.then(async (db) => {
//     const objectsCollectionName = nconf.get("mongo:collectionNames:objects");
//     const collection = db.collection(objectsCollectionName);

//     return collection;
// });

const partitionCollectionP = mongoClientP.then(async (db) => {
    const partitionsCollectionName = nconf.get("mongo:collectionNames:objects");
    const collection = db.collection(partitionsCollectionName);

    return collection;
});

/**
 * Details of a pending checkpoint operation
 */
interface IPendingCheckpoint {
    // The next offset to checkpoint or null if none
    offset: string;
}

const partitionCheckpoints: { [key: string]: IPendingCheckpoint } = {};

function checkpoint(partition: Collection, id: string, offset: string) {
    // Mark the current checkpoint
    partitionCheckpoints[id] = { offset };

    console.log(`Checkpointing partition ${id} at offset ${offset}`);
    const replaceP = partition.replaceOne({ _id: id }, { _id: id, startAfterOffset: offset }, { upsert: true });
    return replaceP.then(
        () => {
            // Enqueue another checkpoint if pending. Otherwise mark none are left
            if (partitionCheckpoints[id].offset !== offset) {
                checkpoint(partition, id, offset);
            } else {
                console.log("No messages to checkpoint");
                delete partitionCheckpoints[id];
            }
        },
        (error) => {
            console.error(`Error checkpointing ${error}. Delaying then trying again`);
            setTimeout(() => checkpoint(partition, id, partitionCheckpoints[id].offset), 10000);
        });
}

function enqueueCheckpoint(partition: Collection, id: string, offset: string) {
    // See if we have a pending checkpoint in the queue. If so update the offset. Otherwise kick off
    // the checkpoint operation
    const pendingCheckpoint = partitionCheckpoints[id];
    if (pendingCheckpoint) {
        pendingCheckpoint.offset = offset;
    } else {
        checkpoint(partition, id, offset);
    }
}

async function listenForMessages(client: Client, sender: Sender, id: string) {
    // Need to go and grab the sequence number where we last checkpointed
    let partitions = await partitionCollectionP;
    let partition = await partitions.findOne({ _id: id });

    let options = null;
    if (!partition) {
        console.log("New partition - creating root document");
        partition = {
            _id: id,
        };

        // TODO remove this later once things have stabalized. This just avoids reading earlier data until we're
        // ready for it.
        options = {
            startAfterTime: Date.now(),
        };
    } else {
        console.log(`Existing partition at offset ${partition.startAfterOffset}`);

        options = {
            startAfterOffset: partition.startAfterOffset,
        };
    }

    client.createReceiver(consumerGroup, id, options).then((receiver) => {
        console.log(`Receiver created for partition ${id}`);
        receiver.on("errorReceived", (error) => {
            console.log(error);
        });

        receiver.on("message", (message) => {
            // tslint:disable-next-line
            console.log(`Received message on partition ${id} with key ${message.partitionKey} at offset ${message.offset}`);
            console.log(JSON.stringify(message, null, 2));

            // TODO assign the sequence number here
            console.log(`Assigning sequence number`);
            const submitOpMessage = message.body as socketStorage.ISubmitOpMessage;
            const routedMessage: socketStorage.IRoutedOpMessage = {
                clientId: submitOpMessage.clientId,
                objectId: submitOpMessage.objectId,
                op: submitOpMessage.op,
                sequenceNumber: 0, // FILL ME IN!
            };

            // Serialize the sequenced message to the event hub
            console.log(`Serializing sequenced message to event hub`);
            sender.send(routedMessage, routedMessage.objectId);

            // Indicate that we can checkpoint
            enqueueCheckpoint(partitions, id, message.offset);
        });

        console.log("Listening");
    });
}

receiveClient.open().then(() => {
    senderP.then((sender) => {
        receiveClient.getPartitionIds().then((ids) => {
            for (const id of ids) {
                listenForMessages(receiveClient, sender, id);
            }
        });
    });
});
