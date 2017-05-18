import * as amqp from "amqplib";
import * as kafka from "kafka-node";
import * as nconf from "nconf";
import * as path from "path";
import * as core from "../core";
import * as utils from "../utils";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// Prep RabbitMQ
const snapshotQueue = nconf.get("tmz:queue");
const rabbitmqConnectionString = nconf.get("rabbitmq:connectionString");

// Setup Kafka connection
const zookeeperEndpoint = nconf.get("zookeeper:endpoint");
const kafkaClientId = nconf.get("tmz:kafkaClientId");
const topic = nconf.get("tmz:topic");
const groupId = nconf.get("tmz:groupId");

async function run() {
    const connection = await amqp.connect(rabbitmqConnectionString);
    const channel = await connection.createChannel();
    await channel.assertQueue(snapshotQueue, { durable: true });

    // The rabbitmq library does not support re-connect. We will simply exit and rely on being restarted once
    // we lose our connection to RabbitMQ.
    connection.on("error", (error) => {
        console.error("Lost connection to RabbitMQ - exiting");
        console.error(error);
        process.exit(1);
    });

    // Create the consumer group and wire up messages
    const consumerGroup = new kafka.ConsumerGroup({
            fromOffset: "earliest",
            groupId,
            host: zookeeperEndpoint,
            id: kafkaClientId,
            protocol: ["roundrobin"],
        },
        [topic]);

    consumerGroup.on("error", (error) => {
        console.error(error);
    });

    const createdRequests: any = {};
    consumerGroup.on("message", async (message: any) => {
        const value = JSON.parse(message.value) as core.IRawOperationMessage;

        if (createdRequests[value.objectId]) {
            return;
        }

        createdRequests[value.objectId] = true;
        console.log(`Requesting snapshots for ${value.objectId}`);

        channel.sendToQueue(snapshotQueue, new Buffer(value.objectId), { persistent: true });
    });

    // We await ensure topics at the end to make sure we've registered all message handlers on the consumer group
    // during the current turn
    await utils.kafka.ensureTopics((<any> consumerGroup).client, [topic]);
}

// Start up the TMZ service
const runP = run();
runP.catch((error) => {
    console.error(error);
    process.exit(1);
});
