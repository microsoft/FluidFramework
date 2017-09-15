// Setup the configuration system - pull arguments, then environment variables - prior to loading other modules that
// may depend on the config already being initialized
import * as nconf from "nconf";
import * as path from "path";
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config/config.json")).use("memory");

import { queue } from "async";
import * as io from "socket.io-client";
import * as api from "../api";
import * as messages from "../socket-storage/messages";
import * as utils from "../utils";
import { logger } from "../utils";

const kafkaEndpoint = nconf.get("perf:lib:endpoint");
const kafkaLibrary = nconf.get("perf:lib:name");
const receiveTopic = nconf.get("deli:topics:receive");
const chunkSize = nconf.get("perf:chunkSize");

console.log("Perf testing client.....");
runTest();

const socket = io("http://alfred:3000", { transports: ["websocket"] });

const objectId = "test-document";

async function runTest() {
    console.log("Wait for 10 seconds to warm up kafka and zookeeper....");
    await sleep(10000);
    produce();
    await consume();
}

async function consume() {
    const throughput = new utils.ThroughputCounter(logger.info, "FromClient-ConsumerPerf: ", 1000);

    console.log("Waiting for messages...");
    const q = queue((message: any, callback) => {
        throughput.produce();
        throughput.acknolwedge();
        callback();
    }, 1);

    let consumer = utils.kafkaConsumer.create(kafkaLibrary, kafkaEndpoint, "client", receiveTopic, true);
    consumer.on("data", (data) => {
        q.push(data);
    });

    consumer.on("error", (err) => {
        console.error(`Error on reading kafka data`);
    });

    // Also trigger clean shutdown on Ctrl-C
    process.on("SIGINT", () => {
        console.log("Attempting to shut down consumer instance...");
        consumer.close();
    });
}

async function produce() {
    const throughput = new utils.ThroughputCounter(logger.info, "ToClient-ProducerPerf: ", 1000);
    let clientId = await connect();

    // Prepare the message that alfred understands.
    const message: api.IMessage = {
        clientSequenceNumber: 100,
        op: "test",
        referenceSequenceNumber: 200,
    };

    for (let i = 1; i <= chunkSize; ++i) {
        throughput.produce();
        socket.emit("submitOp", clientId, message, (error) => {
            if (error) {
                console.log(`Error sending to socket: ${error}`);
            }
            throughput.acknolwedge();
        });
    }
}

async function connect() {
    const connectMessage: messages.IConnect = {
        objectId,
        type: "https://graph.microsoft.com/types/map",
    };
    return new Promise((resolve, reject) => {
        socket.emit(
            "connectObject",
            connectMessage,
            (error, response: messages.IConnected) => {
                if (error) {
                    return reject(error);
                } else {
                    console.log(`Connection successful!`);
                    resolve(response.clientId);
                }
            });
    });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
