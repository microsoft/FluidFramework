import * as kafka from "kafka-node";
import * as nconf from "nconf";
import * as path from "path";
import * as io from "socket.io-client";
import * as api from "../api";
import * as messages from "../socket-storage/messages";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

const kafkaClientId = nconf.get("deli:kafkaClientId");
const zookeeperEndpoint = nconf.get("zookeeper:endpoint");
const receiveTopic = nconf.get("deli:topics:receive");
const groupId = nconf.get("deli:groupId");
const chunkSize = nconf.get("perf:chunkSize");

console.log("Perf testing client.....");
runTest();

const socket = io("http://alfred:3000", { transports: ["websocket"] });

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
    console.log(`Send to SocketIO Ack time: ${sendStopTime - startTime}`);
    console.log(`Kafka receiving time: ${endTime - receiveStartTime}`);
    console.log(`Total time: ${endTime - startTime}`);
}

async function consume() {
    let kafkaClient = new kafka.Client(zookeeperEndpoint, kafkaClientId);
    const highLevelConsumer = new kafka.HighLevelConsumer(kafkaClient, [{topic: receiveTopic}], {
        autoCommit: false,
        fromOffset: true,
        groupId,
        id: kafkaClientId,
    });

    return new Promise<any>((resolve, reject) => {
        highLevelConsumer.on("error", (error) => {
            console.error(`Error in kafka consumer: ${error}...`);
        });

        highLevelConsumer.on("message", async (message: any) => {
            if (message.offset === 0) {
                receiveStartTime = Date.now();
            }
            if (message.offset === (chunkSize - 1)) {
                endTime = Date.now();
                resolve({data: true});
            }
        });
    });
}

async function produce() {
    await connect();
    // Prepare the message that alfred understands.
    const message: api.IMessage = {
        clientSequenceNumber: 100,
        op: "test",
        referenceSequenceNumber: 200,
    };
    let messagesLeft = chunkSize;

    for (let i = 1; i <= chunkSize; ++i) {
        socket.emit("submitOp", objectId, message, (error) => {
            if (error) {
                console.log(`Error sending to socket: ${error}`);
            } else {
                if (messagesLeft === chunkSize) {
                    startTime = Date.now();
                    console.log(`Ack for first message received.`);
                }
                if (messagesLeft === 1) {
                    sendStopTime = Date.now();
                    console.log(`Time to get ack for all messages: ${sendStopTime - startTime}`);
                }
                --messagesLeft;
            }
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
                    resolve({data: true});
                }
            });
    });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
