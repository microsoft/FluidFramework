import * as kafka from "kafka-node";
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
const chunkSize = nconf.get("perf:chunkSize");

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
produce();
consume();


let startTime: number;
let sendStopTime: number;
let receiveStartTime: number;
let endTime: number;
async function produce() {
    await getOrCreateObject(objectId, "https://graph.microsoft.com/types/map");

    // Producer used to publish messages
    await sleep(10000);
    const producer = new utils.kafka.Producer(zookeeperEndpoint, kafkaClientId, [topic]);

    console.log("Start hammering");
    startTime = Date.now();
    for (var i = 0; i < chunkSize; ++i) {
        // console.log("Sending message: ", i);
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
                // console.log("Message successfully sent to kafka: ", responseMessage);
            },
            (error) => {
                // console.error("Error reading from kafka: ", error);
        });
    }
    sendStopTime = Date.now();
    console.log(`Done sending ${chunkSize} messages: ${sendStopTime}`);
}

async function consume() {
    let kafkaClientId2 = "scriptorium";
    let topic2 = "deltas";
    let kafkaClient = new kafka.Client(zookeeperEndpoint, kafkaClientId2);

    await utils.kafka.ensureTopics(kafkaClient, [topic2]);

    const consumerGroup = new kafka.ConsumerGroup({
            autoCommit: false,
            fromOffset: "earliest",
            groupId: "scriptorium",
            host: zookeeperEndpoint,
            id: kafkaClientId2,
            protocol: ["roundrobin"],
        },
        [topic2]);

    consumerGroup.on("error", (error) => {
        console.error(error);
    });

    console.log("Perf: Waiting for messages...");

    consumerGroup.on("message", async (message: any) => {
        if (message.offset === 1) {
            receiveStartTime = Date.now();
            console.log(`Start receiving messages: ${receiveStartTime}`);
        }
        if (message.offset === chunkSize -1) {
            endTime = Date.now();
            console.log(`Done receiving messages: ${endTime}`);
            calculateTiming();
        }
    });

    function calculateTiming() {
        console.log(`Time to send all messages: ${sendStopTime - startTime}`);
        console.log(`Time to receive all messages: ${endTime - receiveStartTime}`);
        console.log(`Total processing time: ${endTime - startTime}`);
    }

}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}





