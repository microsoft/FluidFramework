import * as core from "@prague/routerlicious/dist/core";
import { DeliLambdaFactory } from "@prague/routerlicious/dist/deli/lambdaFactory";
import { create as createDocumentRouter } from "@prague/routerlicious/dist/document-router";
import { IPartitionLambdaFactory } from "@prague/routerlicious/dist/kafka-service/lambdas";
import * as services from "@prague/routerlicious/dist/services";
import * as utils from "@prague/routerlicious/dist/utils";
import * as _ from "lodash";
import { Provider } from "nconf";
import { RdkafkaProducer } from "./rdkafkaProducer";

async function deliCreate(config: Provider): Promise<IPartitionLambdaFactory> {
    const mongoUrl = config.get("mongo:endpoint") as string;

    const forwardSendTopic = config.get("deli:topics:send");
    const reverseSendTopic = config.get("alfred:topic");

    const documentsCollectionName = config.get("mongo:collectionNames:documents");

    // Connection to stored document details
    const mongoFactory = new services.MongoDbFactory(mongoUrl);
    const mongoManager = new utils.MongoManager(mongoFactory, false);
    const client = await mongoManager.getDatabase();
    const collection = await client.collection<core.IDocument>(documentsCollectionName);

    const kafkaEndpoint = config.get("kafka:endpoint");
    const forwardProducer = new RdkafkaProducer(kafkaEndpoint, forwardSendTopic);
    const reverseProducer = new RdkafkaProducer(kafkaEndpoint, reverseSendTopic);

    return new DeliLambdaFactory(mongoManager, collection, forwardProducer, reverseProducer);
}

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    // nconf has problems with prototype methods which prevents us from storing this as a class
    config.set("documentLambda", { create: deliCreate });
    return createDocumentRouter(config);
}
