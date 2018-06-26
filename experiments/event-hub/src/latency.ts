import * as assert from "assert";
import * as Kafka from "node-rdkafka";
import { Deferred } from "./deferred";

const producer = new Kafka.Producer({
    // 'debug' : 'all',
    "dr_cb": true,  // delivery report callback
    "metadata.broker.list": "kafka:9092", // "prague-eu.servicebus.windows.net:9093"
    // "sasl.mechanisms": "PLAIN",
    // tslint:disable-next-line:max-line-length
    // "sasl.password": "Endpoint=sb://prague-eu.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=u5rC/uCLRQapndUk9+ixNVNfoanpNbtAL8LJYS15DPc=",
    // "sasl.username": "$ConnectionString",
    // "security.protocol": "SASL_SSL",
}, null);
producer.setPollInterval(1);

const consumer = new Kafka.KafkaConsumer(
    {
        // 'debug' : 'all',
        "enable.auto.commit": false,
        "group.id": "node-rdkafka-consumer-flow-example",
        "metadata.broker.list": "kafka:9092", // "prague-eu.servicebus.windows.net:9093",
        // "sasl.mechanisms": "PLAIN",
        // tslint:disable-next-line:max-line-length
        // "sasl.password": "Endpoint=sb://prague-eu.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=u5rC/uCLRQapndUk9+ixNVNfoanpNbtAL8LJYS15DPc=",
        // "sasl.username": "$ConnectionString",
        // "security.protocol": "SASL_SSL",
        "socket.keepalive.enable": true,
    },
    {
        "auto.offset.reset": "latest",
    });

const topicName = "test2";
const partition = 0;

// logging debug messages, if debug is enabled
producer.on("event.log", (log) => {
    console.log(log);
});

// logging all errors
producer.on("event.error", (err) => {
    console.error("Error from producer");
    console.error(err);
});

producer.on("disconnected", (arg) => {
    console.log("producer disconnected. " + JSON.stringify(arg));
});

// logging debug messages, if debug is enabled
consumer.on("event.log", (log) => {
    console.log(log);
});

// logging all errors
consumer.on("event.error", (err) => {
    console.error("Error from consumer");
    console.error(err);
});

// Wait for the ready event before producing
producer.on("ready", (arg) => {
    console.log("producer ready." + JSON.stringify(arg));
});

consumer.on("ready", (arg) => {
    console.log("consumer ready." + JSON.stringify(arg));

    consumer.subscribe([topicName]);
    // start consuming messages
    consumer.consume();
});

consumer.on("disconnected", (arg) => {
    console.log("consumer disconnected. " + JSON.stringify(arg));
});

async function sendBatch(from: number, to: number, suffix: string): Promise<void> {
    for (; from < to; from++) {
        const value = new Buffer(`${Date.now().toString()}: ${suffix}`);
        const key = `test`;

        try {
            producer.produce(topicName, partition, value, key);
        } catch (error) {
            if (Kafka.CODES.ERRORS.ERR__QUEUE_FULL === error.code) {
                console.log(`Outbound full - waiting to send`);
                return new Promise<void>((resolve, reject) => {
                    setTimeout(
                        () => {
                            sendBatch(from, to, suffix).then(
                                () => resolve(),
                                (error) => reject(error));
                        },
                        250);
                });
            }
        }
    }
}

function sendBatches(currentBatch, totalBatches, messagesPerBatch, resolve, reject, suffix: string) {
    if (currentBatch === totalBatches) {
        resolve();
        return;
    }

    const from = currentBatch * messagesPerBatch;
    const to = from + messagesPerBatch;

    console.log(`Send batch with suffix ${suffix}`);
    sendBatch(from, to, suffix).then(
        () => {
            setImmediate(() => sendBatches(currentBatch + 1, totalBatches, messagesPerBatch, resolve, reject, suffix));
        },
        (error) => {
            reject(error);
        });
}

export async function runWriteTest(suffix: string) {
    console.log(`Suffix is ${suffix}`);
    const start = Date.now();

    const totalMessages =      100;
    const messagesPerBatch =    10;
    const totalBatches = totalMessages / messagesPerBatch;
    assert.equal(totalBatches * messagesPerBatch, totalMessages, "total messages should be divisible by batch size");

    const done = new Deferred<void>();

    let counter = 0;
    producer.on("delivery-report", (err, report) => {
        if (err) {
            console.error(err);
        }
        counter++;
        if (counter === totalMessages) {
            done.resolve();
        }

        // if (counter % messagesPerBatch === 0) {
        //   console.log(`Batch ${counter / messagesPerBatch} complete`);
        //   console.log(`Send count === ${sendCount}`);
        // }
    });

    await new Promise((resolve, reject) => {
        sendBatches(0, totalBatches, messagesPerBatch, resolve, reject, suffix);
    });

    await done.promise;

    const end = Date.now();
    const total = end - start;
    console.log("Complete");
    console.log(`${totalMessages} messages in ${total} ms`);
    console.log(`${(totalMessages * 1000 / total).toFixed(4)} msg/s`);

    producer.disconnect();
}

const consumerDeferred = new Deferred<void>();
const producerDeferred = new Deferred<void>();

// starting the producer
producer.connect(null, (error, data) => {
    console.log(`Producer Connected`, error, data);
    producerDeferred.resolve();
});

// starting the consumer
consumer.connect(null, (error, data) => {
    console.log("Consumer connected");
    consumerDeferred.resolve();
});

consumer.on("data", (m) => {
    try {
        // Output the actual message contents
        // console.log(JSON.stringify(m));
        console.log(m.value.toString());
        const [time, suffix] = m.value.toString().split(":");
        const start = Number.parseInt(time);
        const end = Date.now();
        const delta = end - start;
        console.log(`${suffix}: ${delta} = ${end} - ${start}`);
    } catch {
        // ignored
    }
});

Promise.all([consumerDeferred.promise, producerDeferred.promise]).then(async () => {
    // await runWriteTest(process.argv[2]);
});
