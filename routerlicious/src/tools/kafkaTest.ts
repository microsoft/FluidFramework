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
    .option("-o, --offset [offset]", "Offset Only")
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

async function runKafkaProducerTest(startOffset: number) {
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

async function runKafkaConsumerTest(expectedTotal: number, startOffset: number = 0): Promise<number> {
    let client = new kafkaNode.Client(endpoint, clientId);
    let messageCount = 0;
    let startTime: number;
    let endTime: number;

    let deferred: Deferred<number> = new Deferred();

    let fetchOptions: kafkaNode.OffsetFetchRequest = {
        offset: startOffset,
        partition: 0,
        topic,
    };

    let consumerOptions: kafkaNode.ConsumerOptions = {
        autoCommit: false,
        fromOffset: (startOffset !== 0),
    };

    let consumer = new kafkaNode.Consumer(client, [fetchOptions], consumerOptions);

    consumer.on("message", (message) => {
        if (messageCount === 0) {
            startTime = Date.now();
        }
        messageCount++;
        if (messageCount === expectedTotal) {
            endTime = Date.now();
            client.close();
            consumer.close(false, () => {
                deferred.resolve(endTime - startTime);
            });
        }
    });

    consumer.on("offsetOutOfRange", (err) => {
        console.log("Range Error: ");
        console.log(err);
    });

    consumer.on("error", (err) => {
        console.log("Error: ");
        console.log(err);
    });

    return deferred.promise;
}

function getOffsetFromSend(result): number {
    let offset = result[topic][partition.toString()];
    return offset;
}

async function kafkaNodeRunner() {

    if (commander.offset) {
        let startOffset = await getKafkaNodeOffset();
        console.log("Offset: " + startOffset);
    } else {
        console.log("-------Producer-------");
        let startOffset = await getKafkaNodeOffset();
        let totalProducerTime = await runKafkaProducerTest(startOffset);
        let endOffset = await getKafkaNodeOffset();
        const totalOffset = endOffset - startOffset;

        let messagesPerSecond = (totalOffset / totalProducerTime) * 1000;
        console.log("Total Time: " + totalProducerTime);
        console.log("Total Acked Messages: " + totalOffset);
        if (totalOffset !== commander.messages) {
            console.log("ERROR: Expected Acks: " + commander.messages + " Real Acks: " + totalOffset);
        }
        console.log("Time (ms) Per Ack (offset): " + (totalProducerTime / totalOffset));
        console.log("Messages/Second: " + messagesPerSecond);

        console.log("-------Consumer-------");
        let totalConsumerTime = await runKafkaConsumerTest(totalOffset, startOffset);
        console.log("Total Time: " + totalConsumerTime);
        console.log("Time (ms) per read: " + (totalConsumerTime / totalOffset));
        console.log("Messages/Second: " + (totalOffset * 1000 / totalConsumerTime));
    }
}

kafkaNodeRunner();
