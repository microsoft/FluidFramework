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


console.log("Perf testing deli.");
// const objectId = uuid.v4();
const objectId = "test-document";
runTest();


let startTime: number;
let sendStopTime: number;
let receiveStartTime: number;
let endTime: number;
let perfMap: { [key: string]: Array<number>} = {};

async function runTest() {
    console.log("Wait for 10 seconds to warm up everything....");
    await sleep(10000);
    for (let i = 1; i <= 1; ++i) {
        console.log(`PASS ${i}...........................`);
        console.log("Start producing messages to kafka...");
        produce(i);
        console.log("Start receiving from kafka...");
        await consume(i);
        console.log("Done receiving from kafka.")
    }
    console.log("PRINTING FINAL METRICS.......................");
    printMap();
}


async function produce(pass: number) {
    await getOrCreateObject(objectId, "https://graph.microsoft.com/types/map");

    // Producer used to publish messages
    
    const producer = new utils.kafka.Producer(zookeeperEndpoint, kafkaSendClientId, [topic]);

    console.log(`SENDING MESSAGES FOR PASS ${pass}...`);

    let messagesLeft = chunkSize;
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
    const payload = [{ topic, messages: [JSON.stringify(rawMessage)], key: objectId }];

    for (var i = 0; i < chunkSize; ++i) {
        producer.send(payload).then(
            (responseMessage) => {
                if (messagesLeft === chunkSize) {
                    startTime = Date.now();
                    console.log(`First message received: ${JSON.stringify(responseMessage)}`);
                }
                if (messagesLeft === 1) {
                    sendStopTime = Date.now();
                    updateMap("PushToKafkaTime", sendStopTime - startTime);
                    console.log(`Pass ${pass}: Time to send all messages: ${sendStopTime - startTime}`);
                    console.log(`Pass ${pass}: Done sending ${chunkSize} messages to kafka: ${JSON.stringify(responseMessage)}`);
                }
                --messagesLeft;
            },
            (error) => {
                console.error(`Error writing to kafka: ${error}`);
        });
    }
}

async function consume(pass: number): Promise<void> {
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

    console.log("Perf: Waiting for messages...");

    return new Promise<any>((resolve, reject) => {
        
        consumerGroup.on("error", (error) => {
            console.error(error);
            reject(error);
        });

        consumerGroup.on("message", async (message: any) => {
            if (message.offset === (pass-1)*chunkSize) {
                receiveStartTime = Date.now();
                console.log(`Pass ${pass}: Start receiving messages: ${receiveStartTime}`);
            }
            if (message.offset === (pass*chunkSize) -1) {
                endTime = Date.now();
                console.log(`Pass ${pass}: message ${message.offset} received from kafka partition ${message.partition}: ${endTime}`);
                console.log(`Pass ${pass}: Time to receive all messages: ${endTime - receiveStartTime}`);
                console.log(`Pass ${pass}: Total processing time: ${endTime - startTime}`);
                updateMap("ReceiveFromKafkaTime", endTime - receiveStartTime);
                updateMap("ProcessingTime", endTime - startTime);
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

/*
function calculateTiming(startTime: number, sendStopTime: number, receiveStartTime: number, endTime: number) {
    console.log(`Time to send all messages: ${sendStopTime - startTime}`);
    console.log(`Time to receive all messages: ${endTime - receiveStartTime}`);
    console.log(`Total processing time: ${endTime - startTime}`);
}*/


function updateMap(metric: string, value: number) {
    if (!(metric in perfMap)) {
        let newMetric: Array<number> = [value];
        perfMap[metric] = newMetric;
    } else {
        perfMap[metric].push(value);
    }
}

function printMap() {
    for (let metric of Object.keys(perfMap)) {
        let values = perfMap[metric];
        console.log(`${metric}: `);
        for (let value of values) {
            console.log(value);
        }

    }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}





