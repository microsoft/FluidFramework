/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScribeLambdaFactory } from "@fluidframework/server-lambdas";
import { create as createDocumentRouter } from "@fluidframework/server-lambdas-driver";
import { createProducer, MongoDbFactory, TenantManager } from "@fluidframework/server-services";
import {
    DefaultServiceConfiguration,
    IDocument,
    IPartitionLambdaFactory,
    ISequencedOperationMessage,
    MongoManager,
} from "@fluidframework/server-services-core";
import { Provider } from "nconf";

export async function scribeCreate(config: Provider): Promise<IPartitionLambdaFactory> {
    // Access config values
    const mongoUrl = config.get("mongo:endpoint") as string;
    const documentsCollectionName = config.get("mongo:collectionNames:documents");
    const messagesCollectionName = config.get("mongo:collectionNames:scribeDeltas");
    const createCosmosDBIndexes = config.get("mongo:createCosmosDBIndexes");
    const kafkaEndpoint = config.get("kafka:lib:endpoint");
    const kafkaLibrary = config.get("kafka:lib:name");
    const kafkaProducerPollIntervalMs = config.get("kafka:lib:producerPollIntervalMs");
    const kafkaNumberOfPartitions = config.get("kafka:lib:numberOfPartitions");
    const kafkaReplicationFactor = config.get("kafka:lib:replicationFactor");
    const sendTopic = config.get("lambdas:deli:topic");
    const kafkaClientId = config.get("scribe:kafkaClientId");
    const mongoExpireAfterSeconds = config.get("mongo:expireAfterSeconds") as number;

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

    await scribeDeltas.createIndex(
        {
            "documentId": 1,
            "operation.sequenceNumber": 1,
            "tenantId": 1,
        },
        true);

    if (createCosmosDBIndexes) {
        await scribeDeltas.createIndex({ "operation.sequenceNumber": 1 }, false);
    }

    if (mongoExpireAfterSeconds > 0) {
        if (createCosmosDBIndexes) {
            await scribeDeltas.createTTLIndex({_ts:1}, mongoExpireAfterSeconds);
        } else {
            await scribeDeltas.createTTLIndex(
                {
                    mongoTimestamp: 1,
                },
                mongoExpireAfterSeconds);
        }
    }

    const producer = createProducer(
        kafkaLibrary,
        kafkaEndpoint,
        kafkaClientId,
        sendTopic,
        false,
        kafkaProducerPollIntervalMs,
        kafkaNumberOfPartitions,
        kafkaReplicationFactor);

    return new ScribeLambdaFactory(
        mongoManager,
        collection,
        scribeDeltas,
        producer,
        tenantManager,
        DefaultServiceConfiguration);
}

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    // Nconf has problems with prototype methods which prevents us from storing this as a class
    config.set("documentLambda", { create: scribeCreate });
    return createDocumentRouter(config);
}
