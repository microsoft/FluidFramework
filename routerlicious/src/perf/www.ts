import { MongoClient } from "mongodb";
import * as nconf from "nconf";
import * as path from "path";
import * as api from "../api";
import * as core from "../core";
import * as utils from "../utils";
// import * as uuid from "node-uuid";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// Group this into some kind of an interface
const zookeeperEndpoint = nconf.get("zookeeper:endpoint");
const kafkaClientId = nconf.get("perf:kafkaClientId");
const topic = nconf.get("perf:topic");


// Connection to stored document details
const mongoUrl = nconf.get("mongo:endpoint");
const client = MongoClient.connect(mongoUrl);
const objectsCollectionName = nconf.get("mongo:collectionNames:objects");
const objectsCollectionP = client.then((db) => db.collection(objectsCollectionName));

async function getOrCreateObject(id: string, type: string): Promise<boolean> {
    const collection = await objectsCollectionP;
    const dbObjectP = collection.findOne({ _id: id });
    return dbObjectP.then(
        (dbObject) => {
            if (dbObject) {
                if (dbObject.type !== type) {
                    throw new Error("Mismatched shared types");
                }

                return true;
            } else {
                return collection.insertOne({ _id: id, type }).then(() => false);
            }
        });
}


console.log("This is pure perf test. We will hammer deli with messages.");
// const objectId = uuid.v4();
const objectId = "test-document";
hammer();

async function hammer() {
    await getOrCreateObject(objectId, "https://graph.microsoft.com/types/map");

    // Producer used to publish messages
    const producer = new utils.kafka.Producer(zookeeperEndpoint, kafkaClientId, [topic]);
    await sleep(10000);
    console.log("Start hammering");
    for (var i = 0; i < 20; ++i) {
        console.log("Sending message: ", i);
        const message: api.IMessage = {
            clientSequenceNumber: 100,
            referenceSequenceNumber: 200,
            op: "test"
        };
        const rawMessage: core.IRawOperationMessage = {
            clientId: "test-client",
            operation: message,
            objectId: objectId,
            timestamp: Date.now(),
            type: core.RawOperationType,
            userId: null,
        };
        const payload = [{ topic, messages: [JSON.stringify(rawMessage)], key: "test-object" }];
        producer.send(payload).then(
            (responseMessage) => {
                console.log("Message successfully sent to kafka: ", responseMessage);
            },
            (error) => {
                console.error("Error checkpointing to kafka: ", error);
        });
    }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}





