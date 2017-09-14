import * as _ from "lodash";
import { Collection } from "mongodb";
import * as nconf from "nconf";
import * as path from "path";
import * as winston from "winston";
import * as utils from "../utils";
import { ICollection } from "./collection";
import { DeliRunner } from "./runner";

const provider = nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config/config.json")).use("memory");

const mongoUrl = provider.get("mongo:endpoint");
const kafkaEndpoint = provider.get("kafka:lib:endpoint");
const kafkaLibrary = provider.get("kafka:lib:name");
const kafkaClientId = provider.get("deli:kafkaClientId");
const receiveTopic = provider.get("deli:topics:receive");
const sendTopic = provider.get("deli:topics:send");
const checkpointBatchSize = provider.get("deli:checkpointBatchSize");
const checkpointTimeIntervalMsec = provider.get("deli:checkpointTimeIntervalMsec");
const documentsCollectionName = provider.get("mongo:collectionNames:documents");
const groupId = provider.get("deli:groupId");

class MongoCollection<T> implements ICollection<T> {
    constructor(private collection: Collection<any>) {
    }

    public findOne(id: string): Promise<T> {
        return this.collection.findOne({ _id: id });
    }

    public async upsert(id: string, values: any): Promise<void> {
        const $set = _.extend( { _id: id }, values);
        await this.collection.updateOne(
            {
                _id: id,
            },
            {
                $set,
            },
            {
                upsert: true,
            });
    }
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
            level: loggerConfig.level,
            stringify: (obj) => JSON.stringify(obj),
            timestamp: loggerConfig.timestamp,
        }),
    ],
});

async function run() {
    // Connection to stored document details
    const mongoManager = new utils.MongoManager(mongoUrl, false);
    const client = await mongoManager.getDatabase();
    const documentsCollection = await client.collection(documentsCollectionName);
    const collection = new MongoCollection(documentsCollection);

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
