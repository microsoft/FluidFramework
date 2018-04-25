import * as queue from "async/queue";
import * as commander from "commander";
import * as kafkaNode from "kafka-node";
import { Deferred } from "../core-utils";

let endpoint = "zookeeper:2181"; // Must be run internally to use this endpoint
let clientId = "testClient";
let topic = "testtopic"; // Has to be registered
let partition = 0;

commander
    .version("0.0.1")
    .option("-i, --implementation [implementation]", "Choose your Implementation", "kafka-node")
    .option("-m, --messages [messages]", "number of messages to test with", parseFloat, 10 ** 6)
    .option("-b, --batchSize [batchSize]", "how many messages to put in a batch", parseFloat, 1)
    .option("-p, --progress [progress]", "show progress")
    .parse(process.argv);

    console.log("Version: " + commander.implementation +
                " Messages: " + commander.messages +
                " BatchSize: " + commander.batchSize +
                " Progress: " + commander.progress);

async function getKafkaNodeOffset(): Promise<number> {
    let client = new kafkaNode.Client(endpoint, clientId);
    let offset = new kafkaNode.Offset(client);
    let deferred: Deferred<number> = new Deferred();

    offset.fetchLatestOffsets(
        [topic], (err, offsets) => {
        client.close();
        deferred.resolve(offsets[topic]["0"]);
    });

    return deferred.promise;
}

async function runKafkaNodeTest(startOffset: number) {
    console.log("Kafka-Node");
    let client = new kafkaNode.Client(endpoint, clientId);
    let producer = new kafkaNode.Producer(client, {partionerType: 3});

    let deferred: Deferred<number> = new Deferred();

    let messageBatches: string[][] = new Array<string[]>();

    for (let i = 0; i < commander.messages; ) {
        let messageBatch: string[] = [];
        for (let j = 0; j < commander.batchSize && i < commander.messages; j++, i++) {
            let m = "message" + i;
            messageBatch.push(m);
        }
        messageBatches.push(messageBatch);
    }

    producer.on("ready", () => {
        let responseCtr = 0;
        let start = Date.now();

        let sendQueue = new queue((messageBatch: string[], cb) => {
            setImmediate(() => {
                producer.send([{
                    attributes: 0,
                    messages: messageBatch,
                    partition,
                    topic,
                    }],
                    (err, result) => {
                        if (err) {
                            console.log(err);
                        } else {
                            responseCtr++;

                            if (responseCtr === commander.messages) {
                                let totalTime = Date.now() - start;
                                client.close();
                                producer.close((error) => {
                                    deferred.resolve(totalTime);
                                });
                            }
                            if (commander.progress && responseCtr % (commander.messages / 10) === 0) {
                                let offset = getOffsetFromSend(result) - startOffset + 1;
                                console.log((offset * 100 / commander.messages) + "% Completed");
                            }
                        }

                });
                cb();
            });
        }, 1);

        for (let messageBatch of messageBatches) {
            sendQueue.push(messageBatch, () => { return undefined; });
        }
    });
    return deferred.promise;
}

function getOffsetFromSend(result): number {
    let offset = result[topic][partition.toString()];
    return offset;
}

async function kafkaNodeRunner() {

    let startOffset = await getKafkaNodeOffset();
    let totalTime = await runKafkaNodeTest(startOffset);
    let endOffset = await getKafkaNodeOffset();
    const totalOffset = endOffset - startOffset;
    let messagesPerSecond = (totalOffset / totalTime) * 1000;

    console.log("Total Time: " + totalTime);
    console.log("Total Acked Messages: " + totalOffset);
    console.log("Time (ms) Per Ack (offset): " + (totalTime / totalOffset));
    console.log("Messages/Second: " + messagesPerSecond);
}

kafkaNodeRunner();
