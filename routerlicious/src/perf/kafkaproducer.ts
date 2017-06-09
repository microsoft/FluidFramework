import * as nconf from "nconf";
import * as path from "path";
import * as core from "../core";
import * as utils from "../utils";

// Setup the configuration system - pull arguments, then environment letiables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

const zookeeperEndpoint = nconf.get("zookeeper:endpoint");
const kafkaSendClientId = nconf.get("perf:kafkaSendClientId");
const topic = nconf.get("perf:sendTopic");
const chunkSize = nconf.get("perf:chunkSize");

console.log("Perf testing kafka producer...");
runTest();

async function runTest() {
    console.log("Wait for 10 seconds to warm up kafka, zookeeper, and redis....");
    await sleep(10000);
    produce();
}
// let producerInterval;
async function produce() {
    const throughput = new utils.ThroughputCounter("KafkaProducerPerformance: ", console.error, 1000);
    // Producer to push to kafka.
    const producer = new utils.kafka.Producer(zookeeperEndpoint, kafkaSendClientId, topic);
    // Start sending
    let clientSequenceNumber = 1;
    // producerInterval = setInterval(() => {
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
    // }, 0);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
