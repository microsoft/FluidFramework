/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DeliLambdaFactory } from "@microsoft/fluid-server-lambdas";
import { create as createDocumentRouter } from "@microsoft/fluid-server-lambdas-driver";
import * as services from "@microsoft/fluid-server-services";
import * as core from "@microsoft/fluid-server-services-core";
import * as bytes from "bytes";
import { Provider } from "nconf";

export async function deliCreate(config: Provider): Promise<core.IPartitionLambdaFactory> {
    const mongoUrl = config.get("mongo:endpoint") as string;
    const kafkaEndpoint = config.get("kafka:lib:endpoint");
    const kafkaLibrary = config.get("kafka:lib:name");
    const maxMessageSize = bytes.parse(config.get("kafka:maxMessageSize"));

    const kafkaForwardClientId = config.get("deli:kafkaClientId");
    const kafkaReverseClientId = config.get("alfred:kafkaClientId");

    const forwardSendTopic = config.get("deli:topics:send");
    const reverseSendTopic = config.get("alfred:topic");

    const documentsCollectionName = config.get("mongo:collectionNames:documents");

    // Connection to stored document details
    const mongoFactory = new services.MongoDbFactory(mongoUrl);
    const mongoManager = new core.MongoManager(mongoFactory, false);
    const client = await mongoManager.getDatabase();
    // eslint-disable-next-line @typescript-eslint/await-thenable
    const collection = await client.collection<core.IDocument>(documentsCollectionName);

    const forwardProducer = services.createProducer(
        kafkaLibrary,
        kafkaEndpoint,
        kafkaForwardClientId,
        forwardSendTopic,
        maxMessageSize);
    const reverseProducer = services.createProducer(
        kafkaLibrary,
        kafkaEndpoint,
        kafkaReverseClientId,
        reverseSendTopic,
        maxMessageSize);

    return new DeliLambdaFactory(mongoManager, collection, forwardProducer, reverseProducer);
}

export async function create(config: Provider): Promise<core.IPartitionLambdaFactory> {
    // Nconf has problems with prototype methods which prevents us from storing this as a class
    config.set("documentLambda", { create: deliCreate });
    return createDocumentRouter(config);
}
