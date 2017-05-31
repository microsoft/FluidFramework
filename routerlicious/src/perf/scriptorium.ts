import * as _ from "lodash";
import * as msgpack from "msgpack-lite";
import * as nconf from "nconf";
import * as path from "path";
import * as redis from "redis";
import * as api from "../api";
import * as core from "../core";
import * as utils from "../utils";

// Setup the configuration system - pull arguments, then environment letiables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// Setup redis client
let host = nconf.get("redis:host");
let port = nconf.get("redis:port");
let pass = nconf.get("redis:pass");

let options: any = { auth_pass: pass, return_buffers: true };
if (nconf.get("redis:tls")) {
    options.tls = {
        servername: host,
    };
}
let subOptions = _.clone(options);

// Subscriber to read from redis directly.
let sub = redis.createClient(port, host, subOptions);

const zookeeperEndpoint = nconf.get("zookeeper:endpoint");
const kafkaSendClientId = nconf.get("perf:kafkaSendClientId");
const topic = nconf.get("perf:receiveTopic");
const chunkSize = nconf.get("perf:chunkSize");

console.log("Perf testing scriptorium...");
runTest();

const objectId = "test-document";
let startTime: number;
let sendStopTime: number;
let receiveStartTime: number;
let endTime: number;

async function runTest() {
    console.log("Wait for 10 seconds to warm up kafka, zookeeper, and redis....");
    await sleep(10000);
    produce();
    await consume();
    console.log("Done receiving from redis. Printing Final Metrics....");
    console.log(`Send to Kafka Ack time: ${sendStopTime - startTime}`);
    console.log(`Redis receiving time: ${endTime - receiveStartTime}`);
    console.log(`Total time: ${endTime - startTime}`);
}

async function produce() {
    // Producer to push to kafka.
    const producer = new utils.kafka.Producer(zookeeperEndpoint, kafkaSendClientId, topic);
    let messagesLeft = chunkSize;
    // Start sending
    for (let i = 1; i <= chunkSize; ++i) {
        const sequencedOperation: api.ISequencedMessage = {
            clientId: "test-client",
            clientSequenceNumber: 123,
            minimumSequenceNumber: 0,
            op: "submitOp",
            referenceSequenceNumber: 123,
            sequenceNumber: i,
            type: "op",
            userId: "test-user",
        };
        let outputMessage: api.IBase;
        outputMessage = sequencedOperation;
        const sequencedMessage: core.ISequencedOperationMessage = {
            objectId,
            operation: outputMessage,
            type: core.SequencedOperationType,
        };
        producer.send(JSON.stringify(sequencedMessage), objectId).then(
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

async function consume() {
    return new Promise<any>((resolve, reject) => {
        sub.on("message", (channel, message) => {
            let decodedMessage = msgpack.decode(message);
            let sequenceNumber = decodedMessage[1].data[2].sequenceNumber;
            if (sequenceNumber === 1) {
                receiveStartTime = Date.now();
            }
            if (sequenceNumber === chunkSize) {
                endTime = Date.now();
                resolve({data: true});
            }
        });
        // Subscribing to specific redis channel for this document.
        sub.subscribe("socket.io#/#test-document#");
    });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
