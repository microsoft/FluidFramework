// Setup the configuration system - pull arguments, then environment variables - prior to loading other modules that
// may depend on the config already being initialized
import * as nconf from "nconf";
import * as path from "path";
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

import { queue } from "async";
import * as _ from "lodash";
import * as msgpack from "msgpack-lite";
import * as redis from "redis";
import * as api from "../api";
import * as core from "../core";
import * as utils from "../utils";
import { logger } from "../utils";

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

const zookeeperEndpoint = nconf.get("perf:zookeeperEndpoint");
const topic = nconf.get("perf:receiveTopic");
const chunkSize = nconf.get("perf:chunkSize");

console.log("Perf testing scriptorium...");
runTest();

const objectId = "test-document";

async function runTest() {
    console.log("Wait for 10 seconds to warm up kafka, zookeeper, and redis....");
    await sleep(10000);
    produce();
    await consume();
}

async function produce() {
    const throughput = new utils.ThroughputCounter(logger.info, "ToScriptorium-ProducerPerf: ", 1000);
    // Producer to push to kafka.
    const producer = utils.kafkaProducer.create("kafka-node", zookeeperEndpoint, "scriptoriumclient" , topic);
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
        throughput.produce();
        producer.send(JSON.stringify(sequencedMessage), objectId).then(
            (responseMessage) => {
                throughput.acknolwedge();
            },
            (error) => {
                console.error(`Error writing to kafka: ${error}`);
        });
    }
}

async function consume() {
    const throughput = new utils.ThroughputCounter(logger.info, "FromScriptorium-ConsumerPerf: ", 1000);

    console.log("Waiting for messages to arrive from redis...");
    const q = queue((message: any, callback) => {
        callback();
        throughput.acknolwedge();
    }, 1);

    return new Promise<any>((resolve, reject) => {
        sub.on("message", (channel, message) => {
            let decodedMessage = msgpack.decode(message);
            throughput.produce();
            q.push(decodedMessage);
        });
        // Subscribing to specific redis channel for this document.
        sub.subscribe("socket.io#/#test-document#");
    });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
