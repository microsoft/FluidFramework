// import * as nconf from "nconf";
import * as api from "../api";
import * as core from "../core";
import * as utils from "../utils";


// Group this into some kind of an interface
// const zookeeperEndpoint = nconf.get("zookeeper:endpoint");
// const kafkaClientId = nconf.get("perf:kafkaClientId");
// const topic = nconf.get("perf:topic");

// Group this into some kind of an interface
const zookeeperEndpoint = "zookeeper:2181";
const kafkaClientId = "alfred";
const topic = "rawdeltas";



console.log("This is pure perf test. We will hammer deli with messages.");
hammer();

async function hammer() {
    await sleep(10000);
    // Producer used to publish messages
    const producer = new utils.kafka.Producer(zookeeperEndpoint, kafkaClientId, [topic]);
    await sleep(10000);
    console.log("Start hammering");
    for (var i = 0; i < 20; ++i) {
        console.log("Sending message: ", i);
        const message: api.IMessage = {
            clientSequenceNumber: 100,
            referenceSequenceNumber: 200,
            op: "test"
        };

        const rawMessage: core.IRawOperationMessage = {
            clientId: "test-client",
            operation: message,
            objectId: "test-object",
            timestamp: Date.now(),
            type: core.RawOperationType,
            userId: null,
        };
        const payload = [{ topic, messages: [JSON.stringify(rawMessage)], key: "test-object" }];
        console.log(JSON.stringify(payload));
        producer.send(payload).then(
            (responseMessage) => {
                console.log("Message successfully sent to kafka");
            },
            (error) => {
                console.log("Error checkpointing to kafka");
                console.error(error);
        });
    }

}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}





