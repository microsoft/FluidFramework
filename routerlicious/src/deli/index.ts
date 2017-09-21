import * as nconf from "nconf";
import * as path from "path";
import * as winston from "winston";
import * as services from "../services";
import * as utils from "../utils";
import { DeliRunner } from "./runner";

const provider = nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config/config.json")).use("memory");

const mongoUrl = provider.get("mongo:endpoint") as string;
const kafkaEndpoint = provider.get("kafka:lib:endpoint");
const kafkaLibrary = provider.get("kafka:lib:name");
const kafkaClientId = provider.get("deli:kafkaClientId");
const receiveTopic = provider.get("deli:topics:receive");
const sendTopic = provider.get("deli:topics:send");
const checkpointBatchSize = provider.get("deli:checkpointBatchSize");
const checkpointTimeIntervalMsec = provider.get("deli:checkpointTimeIntervalMsec");
const documentsCollectionName = provider.get("mongo:collectionNames:documents");
const groupId = provider.get("deli:groupId");

// Configure logging
utils.configureWinston(provider.get("logger"));

async function run() {
    // Connection to stored document details
    const mongoFactory = new services.MongoDbFactory(mongoUrl);
    const mongoManager = new utils.MongoManager(mongoFactory, false);
    const client = await mongoManager.getDatabase();
    const collection = await client.collection(documentsCollectionName);

    // Prep Kafka producer and consumer
    let producer = utils.kafkaProducer.create(kafkaLibrary, kafkaEndpoint, kafkaClientId, sendTopic);
    let consumer = utils.kafkaConsumer.create(kafkaLibrary, kafkaEndpoint, groupId, receiveTopic, false);

    const runner = new DeliRunner(
        producer,
        consumer,
        collection,
        groupId,
        receiveTopic,
        checkpointBatchSize,
        checkpointTimeIntervalMsec);

    // Listen for shutdown signal in order to shutdown gracefully
    process.on("SIGTERM", () => {
        runner.stop();
    });

    // Return a promise that will never resolve (since we run forever) but will reject
    // should an error occur
    const runningP = runner.start();

    // Clean up all resources when the runner finishes
    const doneP = runningP.catch((error) => error);
    const closedP = doneP.then(() => {
        winston.info("Closing service connections");
        const consumerClosedP = consumer.close();
        const producerClosedP = producer.close();
        const mongoClosedP = mongoManager.close();
        return Promise.all([consumerClosedP, producerClosedP, mongoClosedP]);
    });

    // The result of the run is the success/failure of the runner and closing its dependent resources.
    return Promise.all([runningP, closedP]);
}

// Start up the deli service
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
