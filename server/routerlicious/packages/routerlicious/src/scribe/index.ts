/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScribeLambdaFactory } from "@fluidframework/server-lambdas";
import { create as createDocumentRouter } from "@fluidframework/server-lambdas-driver";
import { createProducer, MongoDbFactory, TenantManager } from "@fluidframework/server-services";
import {
    IDocument,
    IPartitionLambdaFactory,
    ISequencedOperationMessage,
    MongoManager,
} from "@fluidframework/server-services-core";
import * as bytes from "bytes";
import { Provider } from "nconf";

export async function scribeCreate(config: Provider): Promise<IPartitionLambdaFactory> {
    // Access config values
    const mongoUrl = config.get("mongo:endpoint") as string;
    const documentsCollectionName = config.get("mongo:collectionNames:documents");
    const messagesCollectionName = config.get("mongo:collectionNames:scribeDeltas");
    const kafkaEndpoint = config.get("kafka:lib:endpoint");
    const kafkaLibrary = config.get("kafka:lib:name");
    const maxMessageSize = bytes.parse(config.get("kafka:maxMessageSize"));
    const sendTopic = config.get("lambdas:deli:topic");
    const kafkaClientId = config.get("scribe:kafkaClientId");

    // Generate tenant manager which abstracts access to the underlying storage provider
    const authEndpoint = config.get("auth:endpoint");
    const tenantManager = new TenantManager(authEndpoint);

    // Access Mongo storage for pending summaries
    const mongoFactory = new MongoDbFactory(mongoUrl);
    const mongoManager = new MongoManager(mongoFactory, false);
    const client = await mongoManager.getDatabase();

    const [collection, scribeDeltas] = await Promise.all([
        client.collection<IDocument>(documentsCollectionName),
        client.collection<ISequencedOperationMessage>(messagesCollectionName),
    ]);

    await Promise.all([
        scribeDeltas.createIndex(
            {
                "documentId": 1,
                "operation.sequenceNumber": 1,
                "tenantId": 1,
            },
            true),
    ]);

    const producer = createProducer(
        kafkaLibrary,
        kafkaEndpoint,
        kafkaClientId,
        sendTopic,
        maxMessageSize);

    return new ScribeLambdaFactory(
        mongoManager,
        collection,
        scribeDeltas,
        producer,
        tenantManager);
}

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    // Nconf has problems with prototype methods which prevents us from storing this as a class
    config.set("documentLambda", { create: scribeCreate });
    return createDocumentRouter(config);
}
