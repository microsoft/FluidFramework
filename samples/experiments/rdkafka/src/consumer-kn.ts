/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as kafkaNode from "kafka-node";

const endpoint = "kafka:9092";
const topic = "testtopic";

const consumerGroup = new kafkaNode.ConsumerGroup(
    {
        autoCommit: false,
        fromOffset: 'earliest',
        kafkaHost: endpoint,
        groupId: 'kafka-node-consumer-flow-example',
        fetchMaxBytes: 1024 * 1024,
        fetchMinBytes: 1,
        maxTickMessages: 100000,
    },
    [topic]);

consumerGroup.on(
    "error",
    (error) => {
    });

//counter to commit offsets every numMessages are received
var numMessages = 100000;
var counter = 0;
let start: number;    

start = Date.now();

consumerGroup.on(
    'message',
    (message) => {        
        counter++;

        // Update stopwatch periodically
        if (counter % numMessages === 0) {
            const now = Date.now();
            const total = now - start;
            console.log(`${(counter * 1000 / total).toFixed(4)} msg/s - ${counter} / ${total / 1000}`);
            counter = 0;
            start = now;

            consumerGroup.setOffset(topic, message.partition, message.offset);
        }
    });
