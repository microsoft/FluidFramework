import { Provider } from "nconf";
import { IPartitionLambdaFactory } from "../kafka-service/lambdas";
import * as services from "../services";
import * as utils from "../utils";
import { RouteMasterLambdaFactory } from "./lambdaFactory";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const mongoUrl = config.get("mongo:endpoint") as string;
    const documentsCollectionName = config.get("mongo:collectionNames:documents");
    const deltasCollectionName = config.get("mongo:collectionNames:deltas");

    const kafkaEndpoint = config.get("kafka:lib:endpoint");
    const kafkaLibrary = config.get("kafka:lib:name");

    const kafkaClientId = config.get("routemaster:clientId");
    const sendTopic = config.get("routemaster:topics:send");

    // Connection to stored document details
    const mongoFactory = new services.MongoDbFactory(mongoUrl);
    const mongoManager = new utils.MongoManager(mongoFactory, false);
    const client = await mongoManager.getDatabase();
    const collection = await client.collection(documentsCollectionName);
    const deltas = await client.collection(deltasCollectionName);
    const producer = utils.createProducer(kafkaLibrary, kafkaEndpoint, kafkaClientId, sendTopic);

    return new RouteMasterLambdaFactory(mongoManager, collection, deltas, producer);
}

export const id = "routemaster";
