import { queue } from "async";
import * as kafka from "kafka-rest";
import * as nconf from "nconf";
import * as path from "path";
import * as utils from "../utils";

nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

const topic = nconf.get("perf:sendTopic");

console.log("Perf testing kafka rest consumer...");
runTest();

async function runTest() {
    console.log("Wait for 10 seconds to warm up kafka and zookeeper....");
    await sleep(10000);
    consume();
}

async function consume() {
    // Prep Kafka connection
    let kafkaClient = new kafka({ 'url': 'http://kafka-rest:8082' });
    const throughput = new utils.ThroughputCounter("KafkaConsumerPerformance: ", console.error, 1000);

    console.log("Waiting for messages...");
    const q = queue((message: any, callback) => {
        processMessage(message);
        callback();
        throughput.acknolwedge();
    }, 1);

    kafkaClient.consumer("my-consumer-group2").join({
        // "format": "avro",
        // "auto.commit.enable": "false"
        "auto.offset.reset": "smallest"
    }, async function(err, consumer_instance) {
        if (err) {
           console.log(`Some error: ${err}`); 
        } else {
            console.log(`Joined a consumer instance group...`);
            let stream = consumer_instance.subscribe(topic);
            stream.on('data', (msgs) => {
                console.log('Got data');
                for( let i = 0; i < msgs.length; i++) {
                    throughput.produce();
                    q.push(msgs[i].value.toString('utf8'));
                    // let jsonData = JSON.parse(msgs[i].value.toString('utf8'));
                    // console.log(JSON.stringify(jsonData));
                    // console.log(msgs[i].value.toString('utf8'));
                }
            });
            stream.on('error', function(err) {
                console.log("Something broke: " + err);
            });
            // Also trigger clean shutdown on Ctrl-C
            process.on('SIGINT', function() {
                console.log("Attempting to shut down consumer instance...");
                consumer_instance.shutdown();
            });
        }
    });    
}

function processMessage(message: string) {
    // console.log(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
