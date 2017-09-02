import * as nconf from "nconf";
import * as path from "path";
import * as utils from "../utils";
import { DeliService } from "./service";

const provider = nconf.argv().env(<any> "__").file(path.join(__dirname, "../../config.json")).use("memory");

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

async function run() {
    // Connection to stored document details
    const mongoManager = new utils.MongoManager(mongoUrl, false);
    const client = await mongoManager.getDatabase();
    const documentsCollection = await client.collection(documentsCollectionName);

    // Prep Kafka producer and consumer
    let producer = utils.kafkaProducer.create(kafkaLibrary, kafkaEndpoint, kafkaClientId, sendTopic);
    let consumer = utils.kafkaConsumer.create(kafkaLibrary, kafkaEndpoint, groupId, receiveTopic, false);

    const service = new DeliService(groupId, receiveTopic, checkpointBatchSize, checkpointTimeIntervalMsec);

    // Return a promise that will never resolve (since we run forever) but will reject
    // should an error occur
    return service.processMessages(producer, consumer, mongoManager, documentsCollection);
}

// Start up the deli service
utils.logger.info("Starting");
const runP = run();
runP.catch((error) => {
    utils.logger.error(error);
    process.exit(1);
});
