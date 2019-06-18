/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { create as createDocumentRouter, DeliLambdaFactory } from "@prague/lambdas";
import * as services from "@prague/services";
import { IDocument, IPartitionLambdaFactory } from "@prague/services-core";
import * as utils from "@prague/services-utils";
import * as _ from "lodash";
import { Provider } from "nconf";
import { RdkafkaProducer } from "../rdkafka";

export async function deliCreate(config: Provider): Promise<IPartitionLambdaFactory> {
    const mongoUrl = config.get("mongo:endpoint") as string;

    const forwardSendTopic = config.get("deli:topics:send");
    const reverseSendTopic = config.get("alfred:topic");

    const documentsCollectionName = config.get("mongo:collectionNames:documents");

    // Connection to stored document details
    const mongoFactory = new services.MongoDbFactory(mongoUrl);
    const mongoManager = new utils.MongoManager(mongoFactory, false);
    const client = await mongoManager.getDatabase();
    const collection = await client.collection<IDocument>(documentsCollectionName);

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
