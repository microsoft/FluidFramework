// Setup the configuration system - pull arguments, then environment variables - prior to loading other modules that
// may depend on the config already being initialized
import * as nconf from "nconf";
import * as path from "path";
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

import * as core from "../core";
import * as utils from "../utils";
import { logger } from "../utils";

const topic = nconf.get("perf:sendTopic");
const chunkSize = nconf.get("perf:chunkSize");
const restEndpoint = nconf.get("perf:zookeeperEndpoint");

console.log("Perf testing kafka producer...");
runTest();

async function runTest() {
    console.log("Wait for 10 seconds to warm up kafka and zookeeper....");
    await sleep(10000);
    produce();
}
// let producerInterval;
async function produce() {
    const throughput = new utils.ThroughputCounter(logger.info, "KafkaProducerPerformance: ", 1000);
    // Producer to push to kafka.
    const producer = utils.producer.create("kafka-node", restEndpoint, "testclient" ,topic);
    // Start sending
    let clientSequenceNumber = 1;
    const rawMessage: core.IRawOperationMessage = {
        clientId: "producer",
        objectId: "producer",
        operation: {
            clientSequenceNumber: clientSequenceNumber++,
            op: {
                key: "binky",
                type: "set",
                value: "winky",
            },
            referenceSequenceNumber: 0,
        },
        timestamp: Date.now(),
        type: core.RawOperationType,
        userId: "producer",
    };

    for (let i = 0; i < chunkSize; i++) {
        throughput.produce();
        producer.send(JSON.stringify(rawMessage), "producer").then(
            (responseMessage) => {
                throughput.acknolwedge();
            },
            (error) => {
                console.error(error);
            });
    }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
