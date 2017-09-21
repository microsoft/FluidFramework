import * as nconf from "nconf";
import * as path from "path";
import * as redis from "redis";
import * as socketIoEmitter from "socket.io-emitter";
import * as util from "util";
import * as winston from "winston";
import * as services from "../services";
import * as utils from "../utils";
import { ScriptoriumRunner } from "./runner";

const provider = nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config/config.json")).use("memory");

// Initialize Socket.io and connect to the Redis adapter
let redisConfig = provider.get("redis");
const kafkaEndpoint = provider.get("kafka:lib:endpoint");
const kafkaLibrary = provider.get("kafka:lib:name");
const topic = provider.get("scriptorium:topic");
const groupId = provider.get("scriptorium:groupId");
const checkpointBatchSize = provider.get("scriptorium:checkpointBatchSize");
const checkpointTimeIntervalMsec = provider.get("scriptorium:checkpointTimeIntervalMsec");
const mongoUrl = provider.get("mongo:endpoint") as string;
const deltasCollectionName = provider.get("mongo:collectionNames:deltas");

// Configure logging
utils.configureWinston(provider.get("logger"));

async function run() {
    const redisClient = redis.createClient(redisConfig.port, redisConfig.host);
    let io = socketIoEmitter(redisClient);

    const mongoFactory = new services.MongoDbFactory(mongoUrl);
    const mongoManager = new utils.MongoManager(mongoFactory, false);
    const db = await mongoManager.getDatabase();
    const collection = db.collection(deltasCollectionName);
    await collection.createIndex({
            "documentId": 1,
            "operation.sequenceNumber": 1,
        },
        true);

    let consumer = utils.kafkaConsumer.create(kafkaLibrary, kafkaEndpoint, groupId, topic, false);

    const runner = new ScriptoriumRunner(
        consumer,
        collection,
        io,
        groupId,
        topic,
        checkpointBatchSize,
        checkpointTimeIntervalMsec);
    process.on("SIGTERM", () => {
        runner.stop();
    });

    const runningP = runner.start();

    // Clean up all resources when the runner finishes
    const doneP = runningP.catch((error) => error);
    const closedP = doneP.then(() => {
        winston.info("Closing service connections");
        const consumerClosedP = consumer.close();
        const mongoClosedP = mongoManager.close();
        const redisP = util.promisify(((callback) => redisClient.quit(callback)) as Function)();
        Promise.all([consumerClosedP, mongoClosedP, redisP]);
    });

    return Promise.all([runningP, closedP]);
}

// Start up the scriptorium service
winston.info("Starting");
const runP = run();
runP.then(
    () => {
        winston.info("Exiting");
    },
    (error) => {
        winston.error(error);
        process.exit(1);
    });
