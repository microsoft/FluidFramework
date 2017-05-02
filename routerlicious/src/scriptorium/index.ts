import * as kafka from "kafka-node";
import { MongoClient } from "mongodb";
import * as nconf from "nconf";
import * as path from "path";
import * as socketIoEmitter from "socket.io-emitter";
import * as core from "../core";

// Setup the configuration system - pull arguments, then environment variables
nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

// Initialize Socket.io and connect to the Redis adapter
let redisConfig = nconf.get("redis");
let io = socketIoEmitter(({ host: redisConfig.host, port: redisConfig.port }));
io.redis.on("error", (error) => {
    console.error(error);
});

const zookeeperEndpoint = nconf.get("zookeeper:endpoint");
const kafkaClientId = nconf.get("scriptorium:kafkaClientId");
const topic = nconf.get("scriptorium:topic");
const groupId = nconf.get("scriptorium:groupId");

const consumerGroup = new kafka.ConsumerGroup({
        fromOffset: "earliest",
        groupId,
        host: zookeeperEndpoint,
        id: kafkaClientId,
        protocol: ["roundrobin"],
    },
    [topic]);

const mongoUrl = nconf.get("mongo:endpoint");
const mongoClientP = MongoClient.connect(mongoUrl);
const collectionP = mongoClientP.then(async (db) => {
    const deltasCollectionName = nconf.get("mongo:collectionNames:deltas");
    const collection = db.collection(deltasCollectionName);

    const indexP = collection.createIndex({
            "objectId": 1,
            "operation.sequenceNumber": 1,
        },
        { unique: true });

    await indexP;
    return collection;
});

consumerGroup.on("message", async (message: any) => {
    // NOTE the processing of the below messages must make sure to notify clients of the messages in increasing
    // order. Be aware of promise handling ordering possibly causing out of order messages to be delivered.

    const value = JSON.parse(message.value) as core.ISequencedOperationMessage;

    // Serialize the message to backing store
    console.log(`Inserting to mongodb ${value.objectId}@${value.operation.sequenceNumber}`);
    const collection = await collectionP;
    collection.insert(value).catch((error) => {
        console.error("Error serializing to MongoDB");
        console.error(error);
    });

    // Route the message to clients
    console.log(`Routing message to clients ${value.objectId}@${value.operation.sequenceNumber}`);
    io.to(value.objectId).emit("op", value.objectId, value.operation);
});
