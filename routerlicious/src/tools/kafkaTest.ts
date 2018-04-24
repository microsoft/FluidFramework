import * as commander from "commander";
import * as kafkaNode from "kafka-node";

let endpoint = "zookeeper:2181"; // Must be run internally to use this endpoint
let clientId = "testClient";
let topic = "testtopic"; // Has to be registered
let curOffset = 0;

commander
    .version("0.0.1")
    .option("-i, --implementation [implementation]", "Choose your Implementation", "kafka-node")
    .option("-m, --messages [messages]", "number of messages to test with", parseFloat, 10 ** 6)
    .option("-b, --batchSize [batchSize]", "how many messages to put in a batch", parseInt, 1)
    .option("-p, --progress [progress]", "show progress")
    .parse(process.argv);

    console.log("Version: " + commander.implementation +
                " Messages: " + commander.messages +
                " BatchSize: " + commander.batchSize +
                " Progress: " + commander.progress);

export async function getKafkaNodeOffset() {
    let client = new kafkaNode.Client(endpoint, clientId);
    let offset = new kafkaNode.Offset(client);

    await offset.fetchLatestOffsets(
        [topic], (err, offsets) => {
        curOffset = offsets[topic]["0"];
    });
}

export async function runKafkaNodeTest() {
    console.log("Kafka-Node");
    let client = new kafkaNode.Client(endpoint, clientId);
    let producer = new kafkaNode.Producer(client, {partionerType: 3});

    let offset = new kafkaNode.Offset(client);

    let messages: string[] = new Array<string>();

    let start: number;
    producer.on("ready", () => {
        // Build Messages
        for (let i = 0; i < commander.messages; i++) {
            messages.push("message" + i);
        }
        let counter = 0;
        start = Date.now();
        while (messages.length > 1) {
            if (commander.progress && messages.length % (commander.messages / 10) === 0) {
                console.log("Messages added: " + messages.length);
            }
            producer.send([{
                attributes: 0,
                messages: [messages.pop()],
                partition: 0,
                topic,
                }],
                (err, result) => {
                    if (err) {
                        console.log(err);
                    }
                    counter++;
                    if (commander.progress && counter % (commander.messages / 10) === 0) {
                        console.log("Counter: " + counter);
                    }
            });
        }

        producer.send([{
            attributes: 0,
            messages: [messages.pop()],
            partition: 0,
            topic,
            }],
            (err, result) => {
                let totalTime = Date.now() - start;
                counter++;
                console.log("Total Time: " + totalTime);
                console.log("Total Counter: " + counter);
                console.log("Time (ms) Per Ack: " + (totalTime / counter));
        });
    });

    // gets latest offset for each partition
    offset.fetchLatestOffsets(
            [topic], (err, offsets) => {
                let otherTotalTime = Date.now() - start;
                let totalOffset = (offsets[topic]["0"] - curOffset);
                console.log("Time at offset: " + otherTotalTime);
                console.log("Total Acked Messages: " + totalOffset);
                console.log("Time (ms) Per Ack (offset): " + (otherTotalTime / totalOffset));
                process.exit();
        });
}

export async function kafkaNodeRunner() {

    await getKafkaNodeOffset();

    // Wait to confirm prior offset...
    // TODO: could be done in the first pop
    setTimeout(async () => {
        await runKafkaNodeTest();
    }, 5000);
}

kafkaNodeRunner();
