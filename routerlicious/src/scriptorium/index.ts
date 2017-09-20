// Setup the configuration system - pull arguments, then environment variables - prior to loading other modules that
// may depend on the config already being initialized
import { queue } from "async";
import { CollectionInsertManyOptions } from "mongodb";
import * as nconf from "nconf";
import * as path from "path";
import * as redis from "redis";
import * as socketIoEmitter from "socket.io-emitter";
import * as util from "util";
import * as winston from "winston";
import * as core from "../core";
import * as shared from "../shared";
import * as utils from "../utils";

const provider = nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config/config.json")).use("memory");

// Initialize Socket.io and connect to the Redis adapter
let redisConfig = nconf.get("redis");
const kafkaEndpoint = nconf.get("kafka:lib:endpoint");
const kafkaLibrary = nconf.get("kafka:lib:name");
const topic = nconf.get("scriptorium:topic");
const groupId = nconf.get("scriptorium:groupId");
const checkpointBatchSize = nconf.get("scriptorium:checkpointBatchSize");
const checkpointTimeIntervalMsec = nconf.get("scriptorium:checkpointTimeIntervalMsec");
const mongoUrl = nconf.get("mongo:endpoint");
const deltasCollectionName = nconf.get("mongo:collectionNames:deltas");

let checkpointTimer: any;

async function checkpoint(partitionManager: core.PartitionManager) {
    partitionManager.checkPoint();
    // Clear timer since we just checkpointed.
    if (checkpointTimer) {
        clearTimeout(checkpointTimer);
    }
    // Set up next cycle.
    checkpointTimer = setTimeout(() => {
        checkpoint(partitionManager);
    }, checkpointTimeIntervalMsec);
}

/**
 * Default logger setup
 */
const loggerConfig = provider.get("logger");
winston.configure({
    transports: [
        new winston.transports.Console({
            colorize: loggerConfig.colorize,
            handleExceptions: true,
            json: loggerConfig.json,
            label: loggerConfig.label,
            level: loggerConfig.level,
            stringify: (obj) => JSON.stringify(obj),
            timestamp: loggerConfig.timestamp,
        }),
    ],
});

async function run() {
    const deferred = new shared.Deferred<void>();

    const redisClient = redis.createClient(redisConfig.port, redisConfig.host);
    let io = socketIoEmitter(redisClient);
    io.redis.on("error", (error) => {
        deferred.reject(error);
    });

    const mongoManager = new utils.MongoManager(mongoUrl, false);
    const db = await mongoManager.getDatabase();
    const collection = db.collection(deltasCollectionName);
    await collection.createIndex({
            "documentId": 1,
            "operation.sequenceNumber": 1,
        },
        { unique: true });

    let consumer = utils.kafkaConsumer.create(kafkaLibrary, kafkaEndpoint, groupId, topic, false);
    const partitionManager = new core.PartitionManager(
        groupId,
        topic,
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

    const throughput = new utils.ThroughputCounter(winston.info);
    // Mongo inserts don't order promises with respect to each other. To work around this we track the last
    // Mongo insert we've made for each document. And then perform a then on this to maintain causal ordering
    // for any dependent operations (i.e. socket.io writes)
    const lastMongoInsertP: { [documentId: string]: Promise<any> } = {};

    const ioBatchManager = new utils.BatchManager<core.ISequencedOperationMessage>((documentId, work) => {
        // Initialize the last promise if it doesn't exist
        if (!(documentId in lastMongoInsertP)) {
            lastMongoInsertP[documentId] = Promise.resolve();
        }

        winston.verbose(`Inserting to mongodb ${documentId}@${work[0].operation.sequenceNumber}:${work.length}`);
        const insertP = collection.insertMany(work, <CollectionInsertManyOptions> (<any> { ordered: false }))
            .catch((error) => {
                // Ignore duplicate key errors since a replay may cause us to attempt to insert a second time
                if (error.name !== "MongoError" || error.code !== 11000) {
                    return Promise.reject(error);
                }
            });
        lastMongoInsertP[documentId] = lastMongoInsertP[documentId].then(() => insertP);

        lastMongoInsertP[documentId].then(
            () => {
                // Route the message to clients
                // tslint:disable-next-line:max-line-length
                winston.verbose(`Routing message to clients ${documentId}@${work[0].operation.sequenceNumber}:${work.length}`);
                io.to(documentId).emit("op", documentId, work.map((value) => value.operation));
                throughput.acknolwedge(work.length);
            },
            (error) => {
                deferred.reject(error);
            });
    });

    const q = queue((message: any, callback) => {
        // NOTE the processing of the below messages must make sure to notify clients of the messages in increasing
        // order. Be aware of promise handling ordering possibly causing out of order messages to be delivered.

        throughput.produce();
        const baseMessage = JSON.parse(message.value.toString("utf8")) as core.IMessage;
        if (baseMessage.type === core.SequencedOperationType) {
            const value = baseMessage as core.ISequencedOperationMessage;

            // Batch up work to more efficiently send to socket.io and mongodb
            ioBatchManager.add(value.documentId, value);
        }

        // Update partition manager.
        partitionManager.update(message.partition, message.offset);

        // Checkpoint to kafka after completing all operations.
        // We should experiment with 'CheckpointBatchSize' here.
        if (message.offset % checkpointBatchSize === 0) {
            // Finally call checkpointing.
            checkpoint(partitionManager).catch((error) => {
                winston.error(error);
            });
        }
        callback();
    }, 1);

    process.on("SIGTERM", () => {
        const consumerClosedP = consumer.close();
        const mongoClosedP = mongoManager.close();
        const redisP = util.promisify(((callback) => redisClient.quit(callback)) as Function)();

        Promise.all([consumerClosedP, mongoClosedP, redisP]).then(
            () => {
                deferred.resolve();
            },
            (error) => {
                deferred.reject(error);
            });
    });

    return deferred.promise;
}

// Start up the scriptorium service
const runP = run();
runP.catch((error) => {
    winston.error(error);
    process.exit(1);
});
