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


console.log("Perf testing deli.");
// const objectId = uuid.v4();
const objectId = "test-document";
runTest();


async function runTest() {
    let startTime: number;
    let sendStopTime: number;
    let receiveStartTime: number;
    let endTime: number;
    console.log("Wait for 10 seconds to warm up everything....");
    await sleep(10000);
    console.log("Start producing messages to kafka...");
    produce(startTime, sendStopTime);
    console.log("Start receiving from kafka...");
    consume(receiveStartTime, endTime);
}


async function produce(startTime: number, sendStopTime: number) {
    await getOrCreateObject(objectId, "https://graph.microsoft.com/types/map");

    // Producer used to publish messages
    
    const producer = new utils.kafka.Producer(zookeeperEndpoint, kafkaClientId, [topic]);

    console.log("Sending messages...");
    startTime = Date.now();
    for (var i = 0; i < chunkSize; ++i) {
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
                let response = JSON.stringify(responseMessage);
                if (response.includes(String(chunkSize-1))) {
                    sendStopTime = Date.now();
                    console.log(`Done sending ${chunkSize} messages to kafka: ${response}`);
                }
            },
            (error) => {
                console.error(`Error writing to kafka: ${error}`);
        });
    }
}

async function consume(receiveStartTime: number, endTime: number) {
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
        console.log(JSON.stringify(message));
        if (message.offset === 1) {
            receiveStartTime = Date.now();
            console.log(`Start receiving messages: ${receiveStartTime}`);
        }
        if (message.offset === chunkSize -1) {
            endTime = Date.now();
            console.log(`Done receiving messages: ${endTime}`);
            console.log(`Time to receive all messages: ${endTime - receiveStartTime}`);
            consumerGroup.commit((err, data) => {
                if (err) {
                    console.log(`Error checkpointing: ${err}`);
                } else {
                    console.log(`Success checkpointing: ${JSON.stringify(data)}`);
                }
            });
        }
    });

    /*
    function calculateTiming(startTime: number, sendStopTime: number, receiveStartTime: number, endTime: number) {
        console.log(`Time to send all messages: ${sendStopTime - startTime}`);
        console.log(`Time to receive all messages: ${endTime - receiveStartTime}`);
        console.log(`Total processing time: ${endTime - startTime}`);
    }*/

}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}





