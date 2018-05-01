import * as queue from "async/queue";
import * as commander from "commander";
import * as kafkaNode from "kafka-node";
// import * as kafkablizzard from "node-rdkafka";
import { Deferred } from "./deferred";

var kafkaBlizzard = require("node-rdkafka");

let endpoint = "zookeeper:2181"; // Must be run internally to use this endpoint
let kafkaEndpoint = "kafka:9092";
let clientId = "testClient";

let topic = "testtopic"; // Has to be registered
let partition = 0;

commander
    .version("0.0.1")
    .option("-i, --implementation [implementation]", "Choose your Implementation", "kafka-node")
    .option("-m, --messages [messages]", "number of messages to test with", parseFloat, 10 ** 5)
    .option("-b, --batchSize [batchSize]", "how many messages to put in a batch", parseFloat, 1)
    .option("-o, --offset [offset]", "Offset Only")
    .option("-p, --progress [progress]", "show progress")
    .option("-c, --consumer [consumer]", "Fetch messages")
    .option("-s, --startOffset [startOffset]", "Start consumer at this offset", parseFloat, 1)
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

async function runKafkaNodeProducerTest(startOffset: number) {
    let client = new kafkaNode.Client(endpoint, clientId);
    let producer = new kafkaNode.Producer(client, { partitionerType: 3});

    let deferred: Deferred<number> = new Deferred();

    let messageBatches: string[][] = createMessages();

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
                                producer.close(() => {
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

async function runKafkaNodeConsumerTest(expectedTotal: number, startOffset: number = 0): Promise<number> {
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

async function kafkaBlizzardProducerTest(startOffset) {

    let deferred: Deferred<number> = new Deferred();

    let messageBuffers: Buffer[][] = createMessageBuffers();

    // https://github.com/edenhill/librdkafka/blob/master/CONFIGURATION.md
    // GlobalConf, Topic Conf
    let producer = new kafkaBlizzard.Producer({
        "client.id": clientId,
        "debug": "all",
        "dr_cb": (data) => { 
            // console.log("In report callback: " + JSON.stringify(data));
        },
        "dr_msg_cb": (data) => {
            console.log("In DR_MSG_CB");
        },
        "metadata.broker.list": kafkaEndpoint,
    }, {});

    producer.connect({
        "metadata.broker.list": kafkaEndpoint,
        "topic": topic,
      }, (err, data) => {
        producer.setPollInterval(100);
      });

    let responseCtr = 0;
    let start = -1;
    let totalTime = -1;

    producer.on("ready", (arg) => {
        start = Date.now();

        let sendQueue = new queue((messageBatch: Buffer, cb) => {

            setImmediate(() => {
                producer.produce(
                        topic,
                        0,
                        messageBatch,
                    );
                });
            cb();
            }, 1);

        for (let messageBatch of messageBuffers) {
            sendQueue.push(messageBatch, () => { return undefined; });
        }
    });

    producer.on("delivery-report", (err, report) => {
        responseCtr++;

        if (responseCtr === commander.messages) {
            totalTime = Date.now() - start;
            producer.disconnect();
        }
        if (commander.progress && responseCtr % (commander.messages / 10) === 0) {
            console.log((responseCtr * 100 / commander.messages) + "% Completed");
        }
      });

    producer.on("disconnected", (arg) => {
        console.log("Disconnecting Producer");
        deferred.resolve(totalTime);
    });

    return deferred.promise;
}

async function runKafkaBlizzardConsumerTest(expectedTotal: number, startOffset: number = 0): Promise<number> {
    let consumer = new kafkaBlizzard.KafkaConsumer({
        "enable.auto.commit": true,
        'group.id': 'node-rdkafka-consumer-flow-example', // Group is a requirement
        "metadata.broker.list": kafkaEndpoint,
    },
    {
      'auto.offset.reset': 'earliest',    
    });

    let deferred: Deferred<number> = new Deferred();

    let startTime = -1;
    let endTime = -1;
    let messageCount = 0;

    consumer.on("ready", (arg) => {
        consumer.assign([{
            topic: topic,
            partition: partition,
            offset: startOffset, // assign consumer to read from a relative offset
        }]);
        consumer.consume();
        startTime = Date.now();
    });

    consumer.on("data", (data) => {
        messageCount++;
        if (commander.progress && messageCount % (commander.messages / 10) === 0) {
            console.log(messageCount * 100 / commander.messages + "% Received");
        }
        if (messageCount === expectedTotal) {
            endTime = Date.now();
            consumer.disconnect();
        } 
    });

    consumer.on("disconnected", (data) => {
        console.log("Disconnecting Consumer");
        let totalTime = endTime - startTime;
        deferred.resolve(totalTime);
    });

    consumer.connect();
    return deferred.promise;
}

function createMessages(): string[][] {
    let messageBatches: string[][] = new Array<string[]>();

    for (let i = 0; i < commander.messages; ) {
        let messageBatch: string[] = [];
        for (let j = 0; j < commander.batchSize && i < commander.messages; j++, i++) {
            messageBatch.push("message" + i);
        }
        messageBatches.push(messageBatch);
    }
    return messageBatches;
}

function createMessageBuffers(): Buffer[][] {
    let bufferArray: Buffer[][] = [];

    for (let i = 0; i < commander.messages; ) {
        let messageBatch: Buffer[] = [];
        for (let j = 0; j < commander.batchSize && i < commander.messages; j++, i++) {
            messageBatch.push(new Buffer("message" + i));
        }
        bufferArray.push(messageBatch);
    }

    return bufferArray;
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
        let endOffset = 0;
        let totalProducerTime = 0;
        let totalConsumerTime = 0;

        switch (commander.implementation) {
            case("kafka-node"): {
                totalProducerTime = await runKafkaNodeProducerTest(startOffset);
                endOffset = await getKafkaNodeOffset();
                totalConsumerTime = await runKafkaNodeConsumerTest(endOffset - startOffset, startOffset);
                break;
            }
            case("node-rdkafka"): {
                totalProducerTime = await kafkaBlizzardProducerTest(startOffset);
                endOffset = await getKafkaNodeOffset();
                totalConsumerTime = await runKafkaBlizzardConsumerTest(endOffset - startOffset, startOffset);
                break;
            }
            default: {
                console.log("Implementation \'" + commander.implementation + "\' is not yet implemented");
                break;
            }
        }

        const totalOffset = endOffset - startOffset;

        console.log("Total Time: " + totalProducerTime);
        console.log("Total Acked Messages: " + totalOffset);
        if (totalOffset !== commander.messages) {
            console.log("ERROR: Expected Acks: " + commander.messages + " Real Acks: " + totalOffset);
        }
        console.log("Time (ms) Per Ack (offset): " + (totalProducerTime / totalOffset));
        console.log("Messages/Second: " + ((totalOffset / totalProducerTime) * 1000));

        console.log("-------Consumer-------");
        console.log("Total Time: " + totalConsumerTime);
        console.log("Time (ms) per read: " + (totalConsumerTime / totalOffset));
        console.log("Messages/Second: " + (totalOffset * 1000 / totalConsumerTime));
    }
}

kafkaNodeRunner();
