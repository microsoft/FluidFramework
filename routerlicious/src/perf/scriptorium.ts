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
const topic = nconf.get("perf:sendTopic");
const chunkSize = nconf.get("perf:chunkSize");

console.log("Perf testing scriptorium...");
runTest();

const objectId = "test-document";
let startTime: number;
let sendStopTime: number;

async function runTest() {
    console.log("Wait for 10 seconds to warm up kafka and zookeeper....");
    await sleep(10000);
    produce();
}

async function produce() {
    // Producer to push to kafka.
    const producer = new utils.kafka.Producer(zookeeperEndpoint, kafkaSendClientId, [topic]);

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
    const payload = [{ topic, messages: [JSON.stringify(rawMessage)], key: objectId }];
    let messagesLeft = chunkSize;
    // Start sending
    for (let i = 0; i < chunkSize; ++i) {
        console.log(`Sending message: ${i}`);
        producer.send(payload).then(
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
