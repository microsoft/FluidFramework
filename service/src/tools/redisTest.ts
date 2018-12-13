import * as commander from "commander";
import * as rs from "randomstring";
import * as redis from "redis";

function generateRandomBatchMessages(length: number): string[] {
    const messages = new Array<string>();

    for (let i = 0; i < length; i++) {
        const str = rs.generate(1024);
        messages.push(str);
    }

    return messages;
}

commander
    .version("0.1.0")
    .option("-m, --batchSize [batchSize]", "batch size", parseInt, 10)
    .option("-b, --batches [batches]", "total batches", parseInt, 10)
    .option("-s, --size [size]", "message size", parseInt, 1024)
    .parse(process.argv);

console.log(commander.batchSize);
console.log(commander.batches);

const publishClient = redis.createClient(6379, "redis");
const subscribeClient = redis.createClient(6379, "redis");
const topic = "testbandwidth";
let startTime;
let latencySum = 0;
const totalMessages = commander.batchSize * commander.batches;

function sendBatch(current: number, batches: number, messages: string[]) {
    if (current === batches) {
        return;
    }

    const pubMsg = [];
    for (let i = 0; i < messages.length; i++) {
        pubMsg.push({ time: Date.now(), i: current * messages.length + i, m: messages[i] });
    }
    publishClient.publish(topic, JSON.stringify(pubMsg));

    setImmediate(() => sendBatch(current + 1, batches, messages));
}

function runPublishTest() {
    const batches = generateRandomBatchMessages(commander.batchSize);
    startTime = Date.now();
    sendBatch(0, commander.batches, batches);
}

subscribeClient.subscribe("testbandwidth");

subscribeClient.on("subscribe", () => {
    runPublishTest();
});

subscribeClient.on("message", (channel, messageStr) => {
    const messages = JSON.parse(messageStr);
    for (const message of messages) {
        const latency = Date.now() - message.time;
        latencySum += latency;

        // console.log(`${parsed.i} === ${totalMessages - 1}`);
        if (message.i === totalMessages - 1) {
            const end = Date.now();
            const totalTime = end - startTime;
            subscribeClient.unsubscribe();
            subscribeClient.quit();
            publishClient.quit();

            console.log(JSON.stringify({
                end,
                latency: latencySum / totalMessages,
                mbpsBandwidth: 1000 * (totalMessages / 1024) / totalTime,
                messageBandwidth: 1000 * totalMessages / totalTime,
                start: startTime,
                totalMessages,
                totalTime,
            }, null, 2));
        }
    }
});
