import * as kafka from "kafka-node";
import { MongoClient } from "mongodb";
import * as nconf from "nconf";
import * as path from "path";
import * as socketIoEmitter from "socket.io-emitter";

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
            objectId: 1,
            sequenceNumber: 1,
        },
        { unique: true });

    await indexP;
    return collection;
});

consumerGroup.on("message", async (message: any) => {
    const value = JSON.parse(message.value);

    // Serialize the message to backing store
    console.log(`Inserting to mongodb`);
    const collection = await collectionP;
    await collection.insert(value);

    // Route the message to clients
    console.log(`Routing message to clients`);
    io.to(value.objectId).emit("op", value);
});
