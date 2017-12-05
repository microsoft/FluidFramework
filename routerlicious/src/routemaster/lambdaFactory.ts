import { Provider } from "nconf";
import { IContext, IPartitionLambda, IPartitionLambdaFactory } from "../kafka-service/lambdas";
import * as services from "../services";
import * as utils from "../utils";
import { DocumentManager } from "./documentManager";
import { RouteMasterLambda } from "./lambda";

export class RouteMasterLambdaFactory implements IPartitionLambdaFactory {
    public async create(config: Provider, context: IContext): Promise<IPartitionLambda> {
        // TODO The resources really want to be created once and then reused per
        // partition. This is creating a lambda per document.

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
        const producer = utils.kafkaProducer.create(kafkaLibrary, kafkaEndpoint, kafkaClientId, sendTopic);

        const id = config.get("documentId");
        const documentDetails = await DocumentManager.Create(id, collection, deltas);

        return new RouteMasterLambda(documentDetails, producer, context);
    }

    // // TODO integrate dispose
    // public async dispose(): Promise<void> {
    //     const producerClosedP = this.producer.close();
    //     const mongoClosedP = this.mongoManager.close();
    //     await Promise.all([producerClosedP, mongoClosedP]);
    // }
}
