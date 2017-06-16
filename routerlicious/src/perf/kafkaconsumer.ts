// Setup the configuration system - pull arguments, then environment variables - prior to loading other modules that
// may depend on the config already being initialized
import * as nconf from "nconf";
import * as path from "path";
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

import { queue } from "async";
import * as kafka from "kafka-rest";
import * as utils from "../utils";
import { logger } from "../utils";

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
    let kafkaClient = new kafka({ url: endPoint });
    const throughput = new utils.ThroughputCounter(logger.info, "KafkaConsumerPerformance: ", 1000);

    console.log("Waiting for messages...");
    const q = queue((message: any, callback) => {
        callback();
        throughput.acknolwedge();
    }, 1);

    kafkaClient.consumer(groupId).join({
        "auto.commit.enable": "false",
        "auto.offset.reset": "smallest",
    }, (error, consumerInstance) => {
        if (error) {
           console.log(`Consumer Instance Error: ${error}`);
        } else {
            console.log(`Joined a consumer instance group: ${consumerInstance.getUri()}`);
            let stream = consumerInstance.subscribe(topic);
            stream.on("data", (msgs) => {
                for (let i = 0; i < msgs.length; i++) {
                    throughput.produce();
                    q.push(msgs[i].value.toString("utf8"));
                    if (i === msgs.length - 1) {
                        let offsetRequest = {offsets: [{
                            offset: msgs[i].offset,
                            partition: msgs[i].partition,
                            topic,
                        }]};
                        utils.kafka.commitOffset(kafkaClient, consumerInstance.getUri(), offsetRequest).then(
                            (data) => {
                                console.log(`Success checkpointing: ${data}`);
                            },
                            (err) => {
                                console.log(`Error checkpointing: ${err}`);
                            });
                    }
                }
            });
            stream.on("error", (err) => {
                console.log(`Stream Error: ${err}`);
            });
            // Also trigger clean shutdown on Ctrl-C
            process.on("SIGINT", () => {
                console.log("Attempting to shut down consumer instance...");
                consumerInstance.shutdown();
            });
        }
    });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
