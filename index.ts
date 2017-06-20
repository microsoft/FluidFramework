// Setup the configuration system - pull arguments, then environment variables - prior to loading other modules that
// may depend on the config already being initialized
import * as nconf from "nconf";
import * as path from "path";
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

import * as amqp from "amqplib";
import * as core from "../core";
import * as utils from "../utils";
import { logger } from "../utils";

// Prep RabbitMQ
const snapshotQueue = nconf.get("tmz:queue");
const rabbitmqConnectionString = nconf.get("rabbitmq:connectionString");

// Setup Kafka connection
const kafkaEndpoint = nconf.get("kafka:lib:endpoint");
const kafkaLibrary = nconf.get("kafka:lib:name");
const topic = nconf.get("tmz:topic");
const groupId = nconf.get("tmz:groupId");

async function run() {
    const connection = await amqp.connect(rabbitmqConnectionString);
    logger.info("Connected to RabbitMQ");
    const channel = await connection.createChannel();
    await channel.assertQueue(snapshotQueue, { durable: true });
    logger.info("Channel ready");

    const deferred = new utils.Deferred<void>();

    // The rabbitmq library does not support re-connect. We will simply exit and rely on being restarted once
    // we lose our connection to RabbitMQ.
    connection.on("error", (error) => {
        console.error("Lost connection to RabbitMQ - exiting");
        deferred.reject(error);
    });

    let consumer = utils.kafkaConsumer.create(kafkaLibrary, kafkaEndpoint, groupId, topic);
    const createdRequests: any = {};

    consumer.on("data", (message) => {
        const value = JSON.parse(message.value.toString("utf8")) as core.IRawOperationMessage;
        if (createdRequests[value.objectId]) {
            return;
        }
        createdRequests[value.objectId] = true;
        logger.info(`Requesting snapshots for ${value.objectId}`);
        channel.sendToQueue(snapshotQueue, new Buffer(value.objectId), { persistent: true });
    });

    consumer.on("error", (err) => {
        consumer.close();
        deferred.reject(err);
    });

    return deferred.promise;
}

// Start up the TMZ service
logger.info("Starting");
const runP = run();
runP.catch((error) => {
    logger.error(error);
    process.exit(1);
});
