import * as kafka from "kafka-node";
import { MongoClient } from "mongodb";
import * as nconf from "nconf";
import * as path from "path";
import * as api from "../api";
import * as core from "../core";
import * as utils from "../utils";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// Group this into some kind of an interface
const zookeeperEndpoint = nconf.get("zookeeper:endpoint");
const kafkaSendClientId = nconf.get("perf:kafkaSendClientId");
const kafkaReceiveClientId = nconf.get("perf:kafkaReceiveClientId");
const topic = nconf.get("perf:sendTopic");
const receiveTopic = nconf.get("perf:receiveTopic");
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

console.log("Perf testing deli...");
runTest();

const objectId = "test-document";
let startTime: number;
let sendStopTime: number;
let receiveStartTime: number;
let endTime: number;

async function runTest() {
    console.log("Wait for 10 seconds to warm up kafka and zookeeper....");
    await sleep(10000);
    produce();
    await consume();
    console.log("Done receiving from kafka. Printing Final Metrics....");
    console.log(`Send to Kafka Ack time: ${sendStopTime - startTime}`);
    console.log(`Kafka receiving time: ${endTime - receiveStartTime}`);
    console.log(`Total time: ${endTime - startTime}`);
}

async function produce() {
    // Create the object first in the DB.
    await getOrCreateObject(objectId, "https://graph.microsoft.com/types/map");
    // Producer to push to kafka.
    const producer = new utils.kafka.Producer(zookeeperEndpoint, kafkaSendClientId, topic);

    // Prepare the message that deli understands.
    const message: api.IMessage = {
        clientSequenceNumber: 100,
        op: "test",
        referenceSequenceNumber: 200,
    };
    const rawMessage: core.IRawOperationMessage = {
        clientId: "test-client",
        objectId,
        operation: message,
        timestamp: Date.now(),
        type: core.RawOperationType,
        userId: null,
    };

    let messagesLeft = chunkSize;

    // Start sending
    for (let i = 0; i < chunkSize; ++i) {
        producer.send(JSON.stringify(rawMessage), objectId).then(
            (responseMessage) => {
                if (messagesLeft === chunkSize) {
                    startTime = Date.now();
                    console.log(`Ack for first message received: ${JSON.stringify(responseMessage)}`);
                }
                if (messagesLeft === 1) {
                    sendStopTime = Date.now();
                    console.log(`Time to get ack for all messages: ${sendStopTime - startTime}`);
                    console.log(`Ack for ${chunkSize}th message received: ${JSON.stringify(responseMessage)}`);
                }
                --messagesLeft;
            },
            (error) => {
                console.error(`Error writing to kafka: ${error}`);
        });
    }
}

async function consume(): Promise<void> {
    // Bootstrap kafka client to consume.
    let kafkaClient = new kafka.Client(zookeeperEndpoint, kafkaReceiveClientId);
    await utils.kafka.ensureTopics(kafkaClient, [receiveTopic]);

    const consumerGroup = new kafka.ConsumerGroup({
            autoCommit: false,
            fromOffset: "earliest",
            groupId: "scriptorium",
            host: zookeeperEndpoint,
            id: "scriptorium",
            protocol: ["roundrobin"],
        },
        [receiveTopic]);

    console.log("Waiting for messages...");

    return new Promise<any>((resolve, reject) => {
        consumerGroup.on("error", (error) => {
            console.error(error);
            reject(error);
        });

        consumerGroup.on("message", async (message: any) => {
            if (message.offset === 0) {
                receiveStartTime = Date.now();
            }
            if (message.offset === (chunkSize - 1)) {
                endTime = Date.now();

                // Checkpoint to kafka before leaving.
                consumerGroup.commit((err, data) => {
                    if (err) {
                        console.log(`Error checkpointing: ${err}`);
                        reject(err);
                    } else {
                        console.log(`Success checkpointing: ${JSON.stringify(data)}`);
                        resolve({data: true});
                    }
                });
            }
        });
    });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
