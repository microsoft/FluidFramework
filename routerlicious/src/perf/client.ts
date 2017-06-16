import { queue } from "async";
import * as kafka from "kafka-rest";
import * as nconf from "nconf";
import * as path from "path";
import * as io from "socket.io-client";
import * as api from "../api";
import * as messages from "../socket-storage/messages";
import * as utils from "../utils";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

const zookeeperEndpoint = nconf.get("zookeeper:endpoint");
const receiveTopic = nconf.get("deli:topics:receive");
const groupId = nconf.get("deli:groupId");
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
    // Bootstrap kafka client to consume.
    let kafkaClient = new kafka({ 'url': zookeeperEndpoint });
    const throughput = new utils.ThroughputCounter("FromClient-ConsumerPerf: ", console.error, 1000);

    console.log("Waiting for messages...");
    const q = queue((message: any, callback) => {
        processMessage(message);
        callback();
        throughput.acknolwedge();
    }, 1);

    kafkaClient.consumer(groupId).join({
        "auto.commit.enable": "false",
        "auto.offset.reset": "smallest"
    }, (err, consumerInstance) => {
        if (err) {
           console.log(`Consumer Instance Error: ${err}`); 
        } else {
            console.log(`Joined a consumer instance group: ${consumerInstance.getUri()}`);
            let stream = consumerInstance.subscribe(receiveTopic);
            stream.on('data', (msgs) => {
                for( let i = 0; i < msgs.length; i++) {
                    throughput.produce();
                    q.push(msgs[i].value.toString('utf8'));
                }
            });
            stream.on('error', (err) => {
                console.log(`Stream Error: ${err}`);
            });
            // Also trigger clean shutdown on Ctrl-C
            process.on('SIGINT', () => {
                console.log("Attempting to shut down consumer instance...");
                consumerInstance.shutdown();
            });
        }
    });
}

function processMessage(message: string) {
    // console.log(message);
}

async function produce() {
    const throughput = new utils.ThroughputCounter("ToClient-ProducerPerf: ", console.error, 1000);    
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
