import { queue } from "async";
import * as kafka from "kafka-rest";
import * as nconf from "nconf";
import * as path from "path";
import * as utils from "../utils";

nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

const topic = nconf.get("perf:sendTopic");
const endPoint = nconf.get("perf:endPoint");
const groupId = nconf.get("perf:groupId");

console.log("Perf testing kafka rest consumer...");
runTest();

async function runTest() {
    console.log("Wait for 10 seconds to warm up kafka and zookeeper....");
    await sleep(10000);
    consume();
}

async function consume() {
    // Prep Kafka connection
    let kafkaClient = new kafka({ 'url': endPoint });
    const throughput = new utils.ThroughputCounter("KafkaConsumerPerformance: ", console.error, 1000);

    console.log("Waiting for messages...");
    const q = queue((message: any, callback) => {
        processMessage(message);
        callback();
        throughput.acknolwedge();
    }, 1);

    kafkaClient.consumer(groupId).join({
        // "format": "avro",
        // "auto.commit.enable": "false"
        "auto.offset.reset": "smallest"
    }, (err, consumerInstance) => {
        if (err) {
           console.log(`Consumer Instance Error: ${err}`); 
        } else {
            console.log(`Joined a consumer instance group: ${consumerInstance.getUri()}`);
            let stream = consumerInstance.subscribe(topic);
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
    // Not doing anything here.
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
