import * as kafka from "kafka-node";
import * as nconf from "nconf";
import * as path from "path";
import * as io from "socket.io-client";
import * as messages from "../socket-storage/messages";
import * as api from "../api";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

const kafkaClientId = nconf.get("deli:kafkaClientId");
const zookeeperEndpoint = nconf.get("zookeeper:endpoint");
const receiveTopic = nconf.get("deli:topics:receive");
const groupId = nconf.get("deli:groupId");
const chunkSize = nconf.get("perf:chunkSize");

console.log("Perf testing client.....");
runTest();

const objectId = "test-document";
const socket = io("http://alfred:3000", { transports: ["websocket"] });

async function runTest() {
    console.log("Wait for 10 seconds to warm up kafka and zookeeper....");
    await sleep(10000);
    produce();  
    await consume(); 
}

async function consume() {
    let kafkaClient = new kafka.Client(zookeeperEndpoint, kafkaClientId);
    const highLevelConsumer = new kafka.HighLevelConsumer(kafkaClient, [{topic: receiveTopic}], {
        autoCommit: false,
        fromOffset: true,
        groupId,
        id: kafkaClientId,
    });
    highLevelConsumer.on("error", (error) => {
        // Workaround to resolve rebalance partition error.
        // https://github.com/SOHU-Co/kafka-node/issues/90
        console.error(`Error in kafka consumer: ${error}. Wait for 30 seconds and restart...`);
        setTimeout(() => {
            process.exit(1);
        }, 30000);
    });

    highLevelConsumer.on("message", async (message: any) => {
        console.log(`Received message: ${JSON.stringify(message)}`);
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
    for (let i = 1; i <= chunkSize; ++i) {
        socket.emit("submitOp", objectId, message, (error) => {
            if (error) {
                console.log(`Error: ${error}`);
            } else {
                console.log(`Sent to socket`);
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