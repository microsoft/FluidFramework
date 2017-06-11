// Setup the configuration system - pull arguments, then environment variables - prior to loading other modules that
// may depend on the config already being initialized
import * as nconf from "nconf";
import * as path from "path";
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

import * as amqp from "amqplib";
import * as kafka from "kafka-node";
import * as core from "../core";
import * as utils from "../utils";
import { logger } from "../utils";

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
    logger.info("Connected to RabbitMQ");
    const channel = await connection.createChannel();
    await channel.assertQueue(snapshotQueue, { durable: true });
    logger.info("Channel ready");

    // The rabbitmq library does not support re-connect. We will simply exit and rely on being restarted once
    // we lose our connection to RabbitMQ.
    connection.on("error", (error) => {
        logger.error("Lost connection to RabbitMQ - exiting", error);
        process.exit(1);
    });

    // Ensure topics exist
    const kafkaClient = new kafka.Client(zookeeperEndpoint, kafkaClientId);
    await utils.kafka.ensureTopics(kafkaClient, [topic]);

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
        logger.error(error);
    });

    const createdRequests: any = {};
    consumerGroup.on("message", async (message: any) => {
        const value = JSON.parse(message.value) as core.IRawOperationMessage;

        if (createdRequests[value.objectId]) {
            return;
        }

        createdRequests[value.objectId] = true;
        logger.info(`Requesting snapshots for ${value.objectId}`);

        channel.sendToQueue(snapshotQueue, new Buffer(value.objectId), { persistent: true });
    });
}

// Start up the TMZ service
logger.info("Starting");
const runP = run();
runP.catch((error) => {
    logger.error(error);
    process.exit(1);
});
