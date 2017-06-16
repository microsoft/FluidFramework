// Setup the configuration system - pull arguments, then environment variables - prior to loading other modules that
// may depend on the config already being initialized
import * as nconf from "nconf";
import * as path from "path";
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

import { queue } from "async";
import * as kafka from "kafka-rest";
import { MongoClient } from "mongodb";
import * as api from "../api";
import * as core from "../core";
import * as utils from "../utils";
import { logger } from "../utils";

// Group this into some kind of an interface
const zookeeperEndpoint = nconf.get("zookeeper:endpoint");
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

async function runTest() {
    console.log("Wait for 10 seconds to warm up kafka and zookeeper....");
    await sleep(10000);
    produce();
    await consume();
}

async function produce() {
    const throughput = new utils.ThroughputCounter(logger.info, "ToDeli-ProducerPerf: ", 1000);
    // Create the object first in the DB.
    await getOrCreateObject(objectId, "https://graph.microsoft.com/types/map");
    // Producer to push to kafka.
    const producer = new utils.kafka.Producer(zookeeperEndpoint, topic);

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

    // Start sending
    for (let i = 0; i < chunkSize; ++i) {
        throughput.produce();
        producer.send(JSON.stringify(rawMessage), objectId).then(
            (responseMessage) => {
                throughput.acknolwedge();
            },
            (error) => {
                console.error(`Error writing to kafka: ${error}`);
        });
    }
}

async function consume() {
    // Bootstrap kafka client to consume.
    let kafkaClient = new kafka({ url: zookeeperEndpoint });
    const throughput = new utils.ThroughputCounter(logger.info, "FromDeli-ConsumerPerf: ", 1000);

    console.log("Waiting for messages...");
    const q = queue((message: any, callback) => {
        callback();
        throughput.acknolwedge();
    }, 1);

    kafkaClient.consumer("scriptorium").join({
        "auto.commit.enable": "false",
        "auto.offset.reset": "smallest",
    }, (error, consumerInstance) => {
        if (error) {
           console.log(`Consumer Instance Error: ${error}`);
        } else {
            console.log(`Joined a consumer instance group: ${consumerInstance.getUri()}`);
            let stream = consumerInstance.subscribe(receiveTopic);
            stream.on("data", (messages) => {
                for (let msg of messages) {
                    throughput.produce();
                    q.push(msg.value.toString("utf8"));
                }
            });
            stream.on("error", (err) => {
                console.log(`Stream Error: ${err}`);
            });
            // Also trigger clean shutdown on Ctrl-C
            process.on("SIGINT", () => {
                console.log("Attempting to shut down consumer instance...");
                consumerInstance.shutdown();
            });
        }
    });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
