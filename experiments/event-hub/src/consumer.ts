/*
 * node-rdkafka - Node.js wrapper for RdKafka C/C++ library
 *
 * Copyright (c) 2016 Blizzard Entertainment
 *
 * This software may be modified and distributed under the terms
 * of the MIT license.  See the LICENSE.txt file for details.
 */

import * as Kafka from "node-rdkafka";

const consumer = new Kafka.KafkaConsumer(
    {
        // 'debug' : 'all',
        "client.id": Date.now().toString(),
        "enable.auto.commit": false,
        "fetch.min.bytes": 1,
        "fetch.wait.max.ms": 100,
        "group.id": "node-rdkafka-consumer-flow-example",
        "metadata.broker.list": "praguelatencykafka.servicebus.windows.net:9093",
        "sasl.mechanisms": "PLAIN",
        // tslint:disable-next-line:max-line-length
        "sasl.password": "Endpoint=sb://praguelatencykafka.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=yCrpDaQEKFrE3iJ0GM2eBNrqLj4qde4PeTfeCtoUetE=",
        "sasl.username": "$ConnectionString",
        "security.protocol": "SASL_SSL",
        "socket.keepalive.enable": true,
    },
    {
        "auto.offset.reset": "latest",
    });

const topicName = "test";

// logging debug messages, if debug is enabled
consumer.on("event.log", (log) => {
    console.log(log);
});

// logging all errors
consumer.on("event.error", (err) => {
    console.error("Error from consumer");
    console.error(err);
});

consumer.on("ready", (arg) => {
    console.log("consumer ready." + JSON.stringify(arg));

    consumer.subscribe([topicName]);
    // start consuming messages
    consumer.consume();
});

consumer.on("data", (m) => {
    const [time, suffix] = m.value.toString().split(":");
    const start = Number.parseInt(time, 10);
    const end = Date.now();
    const delta = end - start;
    console.log(`${suffix}: ${delta} = ${end} - ${start}`);
});

consumer.on("disconnected", (arg) => {
    console.log("consumer disconnected. " + JSON.stringify(arg));
});

// starting the consumer
consumer.connect(null);

// setTimeout(() => {
//     console.log("disconnect");
//     consumer.disconnect();
// }, 5000);
