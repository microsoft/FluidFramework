// Setup the configuration system - pull arguments, then environment variables - prior to loading other modules that
// may depend on the config already being initialized
import * as nconf from "nconf";
import * as path from "path";
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

import { queue } from "async";
import * as _ from "lodash";
import { Collection } from "mongodb";
import * as core from "../core";
import * as shared from "../shared";
import * as utils from "../utils";
import { logger } from "../utils";
import { TakeANumber } from "./takeANumber";

const mongoUrl = nconf.get("mongo:endpoint");
const kafkaEndpoint = nconf.get("kafka:lib:endpoint");
const kafkaLibrary = nconf.get("kafka:lib:name");
const kafkaClientId = nconf.get("deli:kafkaClientId");
const receiveTopic = nconf.get("deli:topics:receive");
const sendTopic = nconf.get("deli:topics:send");
const checkpointBatchSize = nconf.get("deli:checkpointBatchSize");
const checkpointTimeIntervalMsec = nconf.get("deli:checkpointTimeIntervalMsec");
const objectsCollectionName = nconf.get("mongo:collectionNames:objects");
const groupId = nconf.get("deli:groupId");

let checkpointTimer: any;

function processMessage(
    message: any,
    dispensers: { [key: string]: TakeANumber },
    ticketQueue: {[id: string]: Promise<void> },
    partitionManager: core.PartitionManager,
    producer: utils.kafkaProducer.IProdcuer,
    objectsCollection: Collection) {

    const baseMessage = JSON.parse(message.value.toString("utf8")) as core.IMessage;
    if (baseMessage.type === core.UpdateReferenceSequenceNumberType ||
        baseMessage.type === core.RawOperationType) {

        const objectMessage = JSON.parse(message.value.toString("utf8")) as core.IObjectMessage;
        const objectId = objectMessage.objectId;

        // Go grab the takeANumber machine for the objectId and mark it as dirty.
        // Store it in the partition map. We need to add an eviction strategy here.
        if (!(objectId in dispensers)) {
            dispensers[objectId] = new TakeANumber(objectId, objectsCollection, producer);
            logger.info(`Brand New object Found: ${objectId}`);
        }
        const dispenser = dispensers[objectId];

        // Either ticket the message or update the sequence number depending on the message type
        const ticketP = dispenser.ticket(message);
        ticketQueue[objectId] = ticketP;
    }

    // Update partition manager entry.
    partitionManager.update(message.partition, message.offset);
}

async function checkpoint(
    partitionManager: core.PartitionManager,
    dispensers: TakeANumber[],
    pendingTickets: Array<Promise<void>>) {

    // Clear timer since we will checkpoint now.
    if (checkpointTimer) {
        clearTimeout(checkpointTimer);
    }

    if (pendingTickets.length === 0 && dispensers.length === 0) {
        return;
    }

    // Ticket all messages and empty the queue.
    await Promise.all(pendingTickets);
    pendingTickets = [];

    // Checkpoint to mongo and empty the dispensers.
    let checkpointQueue = dispensers.map((dispenser) => dispenser.checkpoint());
    await Promise.all(checkpointQueue);
    dispensers = [];

    // Finally call kafka checkpointing.
    partitionManager.checkPoint();

    // Set up next cycle.
    checkpointTimer = setTimeout(() => {
        checkpoint(partitionManager, dispensers, pendingTickets);
    }, checkpointTimeIntervalMsec);
}

async function processMessages(
    producer: utils.kafkaProducer.IProdcuer,
    consumer: utils.kafkaConsumer.IConsumer,
    objectsCollection: Collection): Promise<void> {

    const deferred = new shared.Deferred<void>();
    const dispensers: { [key: string]: TakeANumber } = {};
    const partitionManager = new core.PartitionManager(
        groupId,
        receiveTopic,
        consumer,
        checkpointBatchSize,
        checkpointTimeIntervalMsec,
    );

    consumer.on("data", (message) => {
        q.push(message);
    });

    consumer.on("error", (err) => {
        consumer.close();
        deferred.reject(err);
    });

    let ticketQueue: {[id: string]: Promise<void> } = {};

    const throughput = new utils.ThroughputCounter(logger.info);

    logger.info("Waiting for messages");
    const q = queue((message: any, callback) => {
        throughput.produce();
        processMessage(message, dispensers, ticketQueue, partitionManager, producer, objectsCollection);
        throughput.acknolwedge();

        // Periodically checkpoints to mongo and checkpoints offset back to kafka.
        // Ideally there should be a better strategy to figure out when to checkpoint.
        if (message.offset % checkpointBatchSize === 0) {
            const pendingDispensers = _.keys(ticketQueue).map((key) => dispensers[key]);
            const pendingTickets = _.values(ticketQueue);
            ticketQueue = {};
            checkpoint(partitionManager, pendingDispensers, pendingTickets).catch((error) => {
                deferred.reject(error);
            });
        }
        callback();
    }, 1);

    return deferred.promise;
}

async function run() {
    // Connection to stored document details
    const mongoManager = new utils.MongoManager(mongoUrl, false);
    const client = await mongoManager.getDatabase();
    const objectsCollection = await client.collection(objectsCollectionName);
    logger.info("Collection ready");

    // Prep Kafka producer and consumer
    let producer = utils.kafkaProducer.create(kafkaLibrary, kafkaEndpoint, kafkaClientId, sendTopic);
    let consumer = utils.kafkaConsumer.create(kafkaLibrary, kafkaEndpoint, groupId, receiveTopic, false);

    // Return a promise that will never resolve (since we run forever) but will reject
    // should an error occur
    return processMessages(producer, consumer, objectsCollection);
}

// Start up the deli service
logger.info("Starting");
const runP = run();
runP.catch((error) => {
    logger.error(error);
    process.exit(1);
});
