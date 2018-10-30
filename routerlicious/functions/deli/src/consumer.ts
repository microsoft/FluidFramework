import * as Kafka from "node-rdkafka";

// https://github.com/edenhill/librdkafka/wiki/How-to-decrease-message-latency

const consumer = new Kafka.KafkaConsumer(
    {
        "enable.auto.commit": false,
        "event_cb": () => {
            console.log("event_cb");
        },
        "fetch.error.backoff.ms": 20,
        "fetch.wait.max.ms": 5,
        "group.id": "node-rdkafka-consumer-flow-example",
        "metadata.broker.list": "kafka:9092",
        "rebalance_cb": (err, assignment) => {
            if (err.code === Kafka.CODES.ERRORS.ERR__ASSIGN_PARTITIONS) {
                console.log("NEW ASSIGNMENTS", assignment);
                // Note: this can throw when you are disconnected. Take care and wrap it in
                // a try catch if that matters to you
                consumer.assign(assignment);
            } else if (err.code === Kafka.CODES.ERRORS.ERR__REVOKE_PARTITIONS) {
                console.log("REMOVE ASSIGNMENTS", assignment);
                // Same as above
                consumer.unassign();
            } else {
                // We had a real error
                console.error(err);
            }
        },
        "statistics.interval.ms": 10000,
        "stats_cb": (stats) => {
            console.log("I got stats!");
        },
    },
    {
        "auto.offset.reset": "latest",
    });

const topicName = "rawdeltas";

// logging debug messages, if debug is enabled
consumer.on("event.log", (log) => {
    console.log(log);
});

// logging all errors
consumer.on("event.error", (err) => {
    console.error("Error from consumer");
    console.error(err);
});

consumer.on("rebalance", (stuff) => {
    console.log("rebalance");
    // console.log(stuff);
});

consumer.on("ready", (arg) => {
    console.log("consumer ready", arg);

    console.log("Assignments", consumer.assignments());

    consumer.subscribe([topicName]);
    // start consuming messages
    consumer.consume();
});

(consumer as any).on("event.stats", (stats) => {
    // console.log("I GOT STATS!", stats);
    // console.log("Assignments", consumer.assignments());
});

consumer.on("data", (m) => {
    // Output the actual message contents
    console.log(m.offset);
    // console.log(m.value.toString());

    if (m.offset % 1000 === 0) {
        console.log("Commit trigger");
        consumer.commit([{ topic: topicName, partition: m.partition, offset: m.offset }]);
    }
});

consumer.on("disconnected", (arg) => {
    console.log("consumer disconnected. " + JSON.stringify(arg));
});

// starting the consumer
consumer.connect();
