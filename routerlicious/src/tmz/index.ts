// Setup the configuration system - pull arguments, then environment variables - prior to loading other modules that
// may depend on the config already being initialized
import * as nconf from "nconf";
import * as path from "path";
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

import * as amqp from "amqplib";
import { queue } from "async";
import * as kafka from "kafka-rest";
import * as core from "../core";
import * as utils from "../utils";
import { logger } from "../utils";

// Prep RabbitMQ
const snapshotQueue = nconf.get("tmz:queue");
const rabbitmqConnectionString = nconf.get("rabbitmq:connectionString");

// Setup Kafka connection
const zookeeperEndpoint = nconf.get("zookeeper:endpoint");
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

    const kafkaClient = new kafka({ 'url': zookeeperEndpoint });
    const createdRequests: any = {};

    kafkaClient.consumer(groupId).join({
        "auto.commit.enable": "false",
        "auto.offset.reset": "smallest"
    }, (error, consumerInstance) => {
        if (error) {
            deferred.reject(error);
        } else {
            let stream = consumerInstance.subscribe(topic);
            stream.on('data', (messages) => {
                for (let msg of messages) {
                    q.push(msg);
                }
            });
            stream.on('error', (err) => {
                consumerInstance.shutdown();
                deferred.reject(err);
            });
        }
    });

    const q = queue((message: any, callback) => { 
        const value = JSON.parse(message.value.toString('utf8')) as core.IRawOperationMessage;
        if (createdRequests[value.objectId]) {
            return;
        }
        createdRequests[value.objectId] = true;
        logger.info(`Requesting snapshots for ${value.objectId}`);
        channel.sendToQueue(snapshotQueue, new Buffer(value.objectId), { persistent: true });
        callback();
    }, 1);

    return deferred.promise;
}

// Start up the TMZ service
logger.info("Starting");
const runP = run();
runP.catch((error) => {
    logger.error(error);
    process.exit(1);
});
