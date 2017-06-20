// Setup the configuration system - pull arguments, then environment variables - prior to loading other modules that
// may depend on the config already being initialized
import * as nconf from "nconf";
import * as path from "path";
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

import { queue } from "async";
import * as utils from "../utils";
import { logger } from "../utils";

const topic = nconf.get("perf:sendTopic");
// const restEndpoint = nconf.get("perf:restEndpoint");
const groupId = nconf.get("perf:groupId");
const zookeeperEndpoint = nconf.get("perf:zookeeperEndpoint");

console.log("Perf testing kafka rest consumer...");
runTest();

async function runTest() {
    console.log("Wait for 10 seconds to warm up kafka and zookeeper....");
    await sleep(10000);
    consume();
}

async function consume() {
    const throughput = new utils.ThroughputCounter(logger.info, "KafkaConsumerPerformance: ", 1000);

    console.log("Waiting for messages...");
    const q = queue((message: any, callback) => {
        throughput.produce();
        throughput.acknolwedge();
        callback();
    }, 1);

    let consumer = utils.consumer.create("kafka-node", zookeeperEndpoint, groupId, topic);
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
