import { queue } from "async";
import * as kafka from "kafka-node";
import * as nconf from "nconf";
import * as path from "path";
import * as utils from "../utils";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

const zookeeperEndpoint = nconf.get("zookeeper:endpoint");
const kafkaClientId = nconf.get("deli:kafkaClientId");
const topic = nconf.get("perf:sendTopic");
const groupId = nconf.get("deli:groupId");


console.log(`Perf testing kafka consumer...`);
runTest();

async function runTest() {
    console.log("Wait for 10 seconds to warm up kafka, zookeeper, and redis....");
    await sleep(10000);
    consume();
}

async function consume() {
    // Prep Kafka connection
    let kafkaClient = new kafka.Client(zookeeperEndpoint, kafkaClientId);
    return utils.kafka.ensureTopics(kafkaClient, [topic])
        .then(() => processMessages(kafkaClient));
}

function processMessages(kafkaClient: kafka.Client) {
    const deferred = new utils.Deferred<void>();
    const throughput = new utils.ThroughputCounter("KafkaConsumerPerformance: ", console.error, 1000);

    const highLevelConsumer = new kafka.HighLevelConsumer(kafkaClient, [topic], <any> {
        autoCommit: false,
        fetchMaxBytes: 1024 * 1024 * 1024,
        fetchMinBytes: 1,
        fromOffset: true,
        groupId,
        id: kafkaClientId,
        maxTickMessages: 100000,
    });

    console.log("Waiting for messages");
    const q = queue((message: any, callback) => {
        processMessage(message);
        callback();
        throughput.acknolwedge();
    }, 1);

    highLevelConsumer.on("error", (error) => {
        // Workaround to resolve rebalance partition error.
        // https://github.com/SOHU-Co/kafka-node/issues/90
        console.error(`Error in kafka consumer: ${error}. Wait for 30 seconds and restart...`);
        setTimeout(() => {
            deferred.reject(error);
        }, 30000);
    });


    highLevelConsumer.on("message", (message: any) => {
        throughput.produce();
        q.push(message);
    });
}

function processMessage(message: any) {
    // Not doing anything here.
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
