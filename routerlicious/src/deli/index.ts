import { Provider } from "nconf";
import { IPartitionLambdaFactory } from "../kafka-service/lambdas";
import * as services from "../services";
import * as utils from "../utils";
import { DeliLambdaFactory } from "./lambdaFactory";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const mongoUrl = config.get("mongo:endpoint") as string;
    const kafkaEndpoint = config.get("kafka:lib:endpoint");
    const kafkaLibrary = config.get("kafka:lib:name");
    const kafkaClientId = config.get("deli:kafkaClientId");
    const sendTopic = config.get("deli:topics:send");
    const documentsCollectionName = config.get("mongo:collectionNames:documents");

    // Connection to stored document details
    const mongoFactory = new services.MongoDbFactory(mongoUrl);
    const mongoManager = new utils.MongoManager(mongoFactory, false);
    const client = await mongoManager.getDatabase();
    const collection = await client.collection(documentsCollectionName);

    let producer = utils.kafkaProducer.create(kafkaLibrary, kafkaEndpoint, kafkaClientId, sendTopic);

    return new DeliLambdaFactory(mongoManager, collection, producer);
}
