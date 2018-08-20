import { Provider } from "nconf";
import * as core from "../core";
import { IPartitionLambdaFactory } from "../kafka-service/lambdas";
import * as services from "../services";
import * as utils from "../utils";
import { DeliLambdaFactory } from "./lambdaFactory";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const mongoUrl = config.get("mongo:endpoint") as string;
    const kafkaEndpoint = config.get("kafka:lib:endpoint");
    const kafkaLibrary = config.get("kafka:lib:name");

    const kafkaForwardClientId = config.get("deli:kafkaClientId");
    const kafkaReverseClientId = config.get("alfred:kafkaClientId");

    const forwardSendTopic = config.get("deli:topics:send");
    const reverseSendTopic = config.get("alfred:topic");

    const documentsCollectionName = config.get("mongo:collectionNames:documents");

    // Connection to stored document details
    const mongoFactory = new services.MongoDbFactory(mongoUrl);
    const mongoManager = new utils.MongoManager(mongoFactory, false);
    const client = await mongoManager.getDatabase();
    const collection = await client.collection<core.IDocument>(documentsCollectionName);

    const forwardProducer = utils.createProducer(kafkaLibrary, kafkaEndpoint, kafkaForwardClientId, forwardSendTopic);
    const reverseProducer = utils.createProducer(kafkaLibrary, kafkaEndpoint, kafkaReverseClientId, reverseSendTopic);

    return new DeliLambdaFactory(mongoManager, collection, forwardProducer, reverseProducer);
}
