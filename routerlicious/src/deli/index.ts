import { queue } from "async";
import * as kafka from "kafka-node";
import * as _ from "lodash";
import { Collection } from "mongodb";
import * as nconf from "nconf";
import * as path from "path";
import * as core from "../core";
import * as utils from "../utils";
import { TakeANumber } from "./takeANumber";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

const mongoUrl = nconf.get("mongo:endpoint");
const zookeeperEndpoint = nconf.get("zookeeper:endpoint");
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
    producer: utils.kafka.Producer,
    objectsCollection: Collection) {

    const baseMessage = JSON.parse(message.value) as core.IMessage;

    if (baseMessage.type === core.UpdateReferenceSequenceNumberType ||
        baseMessage.type === core.RawOperationType) {

        const objectMessage = JSON.parse(message.value) as core.IObjectMessage;
        const objectId = objectMessage.objectId;

        // Go grab the takeANumber machine for the objectId and mark it as dirty.
        // Store it in the partition map. We need to add an eviction strategy here.
        if (!(objectId in dispensers)) {
            dispensers[objectId] = new TakeANumber(objectId, objectsCollection, producer);
            console.log(`Brand New object Found: ${objectId}`);
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

    // Ticket all messages and empty the queue.
    await Promise.all(pendingTickets);

    // Checkpoint to mongo now.
    let checkpointQueue = dispensers.map((dispenser) => dispenser.checkpoint());
    await Promise.all(checkpointQueue);

    // Finally call kafka checkpointing.
    partitionManager.checkPoint();

    // Clear timer since we just checkpointed.
    if (checkpointTimer) {
        clearTimeout(checkpointTimer);
    }
    // Set up next cycle.
    checkpointTimer = setTimeout(() => {
        checkpoint(partitionManager, dispensers, pendingTickets);
    }, checkpointTimeIntervalMsec);
}

function processMessages(
    kafkaClient: kafka.Client,
    producer: utils.kafka.Producer,
    objectsCollection: Collection): Promise<void> {

    const deferred = new utils.Deferred<void>();
    const dispensers: { [key: string]: TakeANumber } = {};

    const consumerOffset = new kafka.Offset(kafkaClient);
    const partitionManager = new core.PartitionManager(
        groupId,
        receiveTopic,
        consumerOffset,
        checkpointBatchSize,
        checkpointTimeIntervalMsec);

    const highLevelConsumer = new kafka.HighLevelConsumer(kafkaClient, [{topic: receiveTopic}], <any> {
        autoCommit: false,
        fetchMaxBytes: 1024 * 1024,
        fetchMinBytes: 1,
        fromOffset: true,
        groupId,
        id: kafkaClientId,
        maxTickMessages: 100000,
    });

    highLevelConsumer.on("error", (error) => {
        // Workaround to resolve rebalance partition error.
        // https://github.com/SOHU-Co/kafka-node/issues/90
        console.error(`Error in kafka consumer: ${error}. Wait for 30 seconds and restart...`);
        setTimeout(() => {
            deferred.reject(error);
        }, 30000);
    });

    let ticketQueue: {[id: string]: Promise<void> } = {};

    const throughput = new utils.ThroughputCounter();

    console.log("Waiting for messages");
    const q = queue((message: any, callback) => {
        processMessage(message, dispensers, ticketQueue, partitionManager, producer, objectsCollection);
        callback();

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

        throughput.acknolwedge();
    }, 1);

    highLevelConsumer.on("message", (message: any) => {
        throughput.produce();
        q.push(message);
    });

    return deferred.promise;
}

async function run() {
    // Connection to stored document details
    const mongoManager = new utils.MongoManager(mongoUrl, false);
    const client = await mongoManager.getDatabase();
    const objectsCollection = await client.collection(objectsCollectionName);
    console.log("Collection ready");

    // Prep Kafka connection
    let kafkaClient = new kafka.Client(zookeeperEndpoint, kafkaClientId);
    let producer = new utils.kafka.Producer(zookeeperEndpoint, kafkaClientId, sendTopic);

    // Return a promise that will never resolve (since we run forever) but will reject
    // should an error occur
    return utils.kafka.ensureTopics(kafkaClient, [sendTopic, receiveTopic])
        .then(() => processMessages(kafkaClient, producer, objectsCollection));
}

// Start up the deli service
console.log("Starting");
const runP = run();
runP.catch((error) => {
    console.error(error);
    process.exit(1);
});
