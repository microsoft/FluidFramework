import { queue } from "async";
import * as kafka from "kafka-node";
import { MongoClient } from "mongodb";
import * as nconf from "nconf";
import * as path from "path";
import * as socketIoEmitter from "socket.io-emitter";
import * as core from "../core";
import * as utils from "../utils";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// Initialize Socket.io and connect to the Redis adapter
let redisConfig = nconf.get("redis");
const zookeeperEndpoint = nconf.get("zookeeper:endpoint");
const kafkaClientId = nconf.get("scriptorium:kafkaClientId");
const topic = nconf.get("scriptorium:topic");
const groupId = nconf.get("scriptorium:groupId");
const checkpointBatchSize = nconf.get("scriptorium:checkpointBatchSize");
const checkpointTimeIntervalMsec = nconf.get("deli:checkpointTimeIntervalMsec");
const mongoUrl = nconf.get("mongo:endpoint");
const deltasCollectionName = nconf.get("mongo:collectionNames:deltas");

async function run() {
    let io = socketIoEmitter(({ host: redisConfig.host, port: redisConfig.port }));
    io.redis.on("error", (error) => {
        console.error(error);
    });

    const db = await MongoClient.connect(mongoUrl);
    const collection = db.collection(deltasCollectionName);
    await collection.createIndex({
            "objectId": 1,
            "operation.sequenceNumber": 1,
        },
        { unique: true });

    let kafkaClient = new kafka.Client(zookeeperEndpoint, kafkaClientId);

    // Validate the required topics exist
    await utils.kafka.ensureTopics(kafkaClient, [topic]);

    const consumerOffset = new kafka.Offset(kafkaClient);
    const partitionManager = new core.PartitionManager(groupId, topic, consumerOffset,
                                                       checkpointBatchSize, checkpointTimeIntervalMsec);

    const highLevelConsumer = new kafka.HighLevelConsumer(kafkaClient, [{topic}], {
            autoCommit: false,
            fromOffset: true,
            groupId,
            id: kafkaClientId,
    });

    highLevelConsumer.on("error", (error) => {
        // Workaround to resolve rebalance partition error.
        // https://github.com/SOHU-Co/kafka-node/issues/90
        console.error(`Error in kafka consumer: ${error}. Wait for 30 seconds and restart...`);
        setTimeout(() => {
            process.exit(1);
        }, 30000);
    });

    const q = queue((message: any, callback) => {
        // NOTE the processing of the below messages must make sure to notify clients of the messages in increasing
        // order. Be aware of promise handling ordering possibly causing out of order messages to be delivered.

        const baseMessage = JSON.parse(message.value) as core.IMessage;
        if (baseMessage.type === core.SequencedOperationType) {
            const value = baseMessage as core.ISequencedOperationMessage;

            // Serialize the message to backing store
            console.log(`Inserting to mongodb ${value.objectId}@${value.operation.sequenceNumber}`);
            collection.insert(value).catch((error) => {
                console.error("Error serializing to MongoDB");
                console.error(error);
            });

            // Route the message to clients
            console.log(`Routing message to clients ${value.objectId}@${value.operation.sequenceNumber}`);
            io.to(value.objectId).emit("op", value.objectId, value.operation);
        }

        // Update partition manager.
        partitionManager.update(message.partition, message.offset);

        // Checkpoint to kafka after completing all operations.
        // We should experiment with 'CheckpointBatchSize' here.
        if (message.offset % checkpointBatchSize === 0) {
            // Finally call kafka checkpointing.
            partitionManager.checkPoint();
        }

        callback();
    }, 1);

    highLevelConsumer.on("message", async (message: any) => {
        q.push(message);
    });
}

// Start up the scriptorium service
const runP = run();
runP.catch((error) => {
    console.error(error);
    process.exit(1);
});
