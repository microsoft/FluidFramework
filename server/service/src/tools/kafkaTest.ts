/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as commander from "commander";
import * as rs from "randomstring";
import { RdkafkaConsumer, RdkafkaProducer } from "../rdkafka";

function generateRandomBatchMessages(length: number, msgSize: number): string[] {
    const messages = new Array<string>();

    for (let i = 0; i < length; i++) {
        const str = rs.generate(msgSize);
        messages.push(str);
    }

    return messages;
}

commander
    .version("0.1.0")
    .option("-m, --batchSize [batchSize]", "batch size", parseInt, 10)
    .option("-b, --batches [batches]", "total batches", parseInt, 10)
    .option("-s, --size [size]", "total size", parseInt, 10)
    .parse(process.argv);

console.log(commander.batchSize);
console.log(commander.batches);
console.log(commander.size);

const topic = "testtopic";
const producer = new RdkafkaProducer("kafka:9092", topic);
const consumer = new RdkafkaConsumer(
    "kafka:9092",
    "tester",
    "tester",
    topic,
    true);

let startTime;
let latencySum = 0;
const totalMessages = commander.batchSize * commander.batches;

function sendBatch(current: number, batches: number, messages: string[]) {
    if (current === batches) {
        return;
    }

    // const pubMsg = [];
    for (; current < batches; current++) {
        for (let i = 0; i < messages.length; i++) {
            // pubMsg.push({ time: Date.now(), i: current * messages.length + i, m: messages[i] });
            producer.send(
                { time: Date.now(), i: current * messages.length + i, m: messages[i] },
                "test",
                "test");
        }
    }

    // producer.send(JSON.stringify(pubMsg), "test");
    // setTimeout(() => sendBatch(current + 1, batches, messages), 1);
    // sendBatch(current + 1, batches, messages));
}

function runPublishTest() {
    console.log("START!");
    const batches = generateRandomBatchMessages(commander.batchSize, commander.size);
    startTime = Date.now();
    sendBatch(0, commander.batches, batches);
}

consumer.on("data", (messageStr) => {
    // console.log(messageStr);
    const message = JSON.parse(messageStr.value.toString());
    // for (const message of messages) {
    const latency = Date.now() - message.time;
    latencySum += latency;

    // console.log(`${parsed.i} === ${totalMessages - 1}`);
    if (message.i === totalMessages - 1) {
        const end = Date.now();
        const totalTime = end - startTime;

        consumer.close();
        producer.close();

        console.log(JSON.stringify({
            end,
            latency: latencySum / totalMessages,
            mbpsBandwidth: 1000 * (totalMessages * commander.size / (1024 * 1024)) / totalTime,
            messageBandwidth: 1000 * totalMessages / totalTime,
            start: startTime,
            totalMessages,
            totalTime,
        }, null, 2));
    }
    // }
});

setTimeout(() => runPublishTest(), 5000);
