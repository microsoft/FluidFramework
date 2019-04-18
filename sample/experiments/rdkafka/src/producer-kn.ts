import * as assert from "assert";
import * as kafkaNode from "kafka-node";

const endpoint = "zookeeper:2181";
const topic = "testtopic";

const client = new kafkaNode.Client(endpoint);
const producer = new kafkaNode.Producer(client, { partitionerType: 3 });

client.on("error", (error) => {
    this.handleError(error);
});

producer.on("ready", () => {
    console.log("READY!");

    client.refreshMetadata(
        [topic],
        (error) => {
            if (error) {
                console.error(error);
            } else {
                console.log("Running test!");
                runWriteTest();
            }
        });
});

producer.on("error", (error) => {
    console.error(error);
});

async function sendBatch(from: number, to: number): Promise<void> {
    let messages: string[] = [];
    for (; from < to; from++) {
        messages.push(`value-${from}`);
    }

    const kafkaMessage = [{ topic, messages, key: 'test' }];

    return new Promise<void>((resolve, reject) => {
        producer.send(kafkaMessage, (error, data) => {
            if (error) {
                console.error(error);
                reject(error);
            } else {
                resolve();
            }
        });
    });
}

function sendBatches(currentBatch, totalBatches, messagesPerBatch, resolve, reject, lastSend: Promise<void>) {
    if (currentBatch === totalBatches) {
        lastSend.then(() => resolve(), (error) => reject(error));
        return;
    }

    const from = currentBatch * messagesPerBatch;
    const to = from + messagesPerBatch;

    const sendP = sendBatch(from, to);
    setImmediate(() => sendBatches(currentBatch + 1, totalBatches, messagesPerBatch, resolve, reject, sendP));
}

async function runWriteTest() {
    const start = Date.now();

    const totalMessages =   1000000;
    const messagesPerBatch =   1000;
    const totalBatches = totalMessages / messagesPerBatch;
    assert.equal(totalBatches * messagesPerBatch, totalMessages, "total messages should be divisible by batch size");

    await new Promise((resolve, reject) => {
        sendBatches(0, totalBatches, messagesPerBatch, resolve, reject, Promise.resolve());
    });

    const end = Date.now();
    const total = end - start;
    console.log("Complete");
    console.log(`Batch size: ${messagesPerBatch}`);
    console.log(`Total messages: ${totalMessages}`);
    console.log(`${totalMessages} messages in ${total} ms`);
    console.log(`${(totalMessages * 1000 / total).toFixed(4)} msg/s`);

    producer.close();
    client.close();
}