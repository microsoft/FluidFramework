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
    const partitionManager = new core.PartitionManager(groupId, topic, consumerOffset, checkpointBatchSize);

    const consumerGroup = new kafka.ConsumerGroup({
            autoCommit: false,
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

    consumerGroup.on("message", async (message: any) => {
        // NOTE the processing of the below messages must make sure to notify clients of the messages in increasing
        // order. Be aware of promise handling ordering possibly causing out of order messages to be delivered.
        const baseMessage = JSON.parse(message.value) as core.IMessage;
        if (baseMessage.type === core.SequencedOperationType) {
            const value = baseMessage as core.ISequencedOperationMessage;
            // const objectId = value.objectId;

            // Serialize the message to backing store
            // console.log(`Inserting to mongodb ${objectId}@${value.operation.sequenceNumber}`);
            // console.log(`Operation is ${JSON.stringify(value.operation)}`);
            collection.insert(value).catch((error) => {
                console.error("Error serializing to MongoDB");
                console.error(error);
            });

            // Route the message to clients
            console.log(`Routing message to clients ${value.objectId}@${JSON.stringify(value.operation)}`);
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
    });
}

// Start up the scriptorium service
const runP = run();
runP.catch((error) => {
    console.error(error);
    process.exit(1);
});
