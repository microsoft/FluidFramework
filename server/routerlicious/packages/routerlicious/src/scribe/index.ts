/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScribeLambdaFactory } from "@fluidframework/server-lambdas";
import { createDocumentRouter } from "@fluidframework/server-routerlicious-base";
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
    const mongoUrl = config.get("mongo:operationsDbEndpoint") as string;
    const documentsCollectionName = config.get("mongo:collectionNames:documents");
    const messagesCollectionName = config.get("mongo:collectionNames:scribeDeltas");
    const createCosmosDBIndexes = config.get("mongo:createCosmosDBIndexes");
    const bufferMaxEntries = config.get("mongo:bufferMaxEntries") as number | undefined;
    const kafkaEndpoint = config.get("kafka:lib:endpoint");
    const kafkaLibrary = config.get("kafka:lib:name");
    const kafkaProducerPollIntervalMs = config.get("kafka:lib:producerPollIntervalMs");
    const kafkaNumberOfPartitions = config.get("kafka:lib:numberOfPartitions");
    const kafkaReplicationFactor = config.get("kafka:lib:replicationFactor");
    const kafkaSslCACertFilePath: string = config.get("kafka:lib:sslCACertFilePath");
    const sendTopic = config.get("lambdas:deli:topic");
    const kafkaClientId = config.get("scribe:kafkaClientId");
    const mongoExpireAfterSeconds = config.get("mongo:expireAfterSeconds") as number;
    const enableWholeSummaryUpload = config.get("storage:enableWholeSummaryUpload") as boolean;

    // Generate tenant manager which abstracts access to the underlying storage provider
    const authEndpoint = config.get("auth:endpoint");
    const tenantManager = new TenantManager(authEndpoint);

    // Access Mongo storage for pending summaries
    const mongoFactory = new MongoDbFactory(mongoUrl, bufferMaxEntries);
    const mongoManager = new MongoManager(mongoFactory, false);
    const client = await mongoManager.getDatabase();

    const [collection, scribeDeltas] = await Promise.all([
        client.collection<IDocument>(documentsCollectionName),
        client.collection<ISequencedOperationMessage>(messagesCollectionName),
    ]);

    if (createCosmosDBIndexes) {
        await scribeDeltas.createIndex({ documentId: 1 }, false);
        await scribeDeltas.createIndex({ tenantId: 1 }, false);
        await scribeDeltas.createIndex({ "operation.sequenceNumber": 1 }, false);
    } else {
        await scribeDeltas.createIndex(
            {
                "documentId": 1,
                "operation.sequenceNumber": 1,
                "tenantId": 1,
            },
            true);
    }

    if (mongoExpireAfterSeconds > 0) {
        if (createCosmosDBIndexes) {
            await scribeDeltas.createTTLIndex({ _ts: 1 }, mongoExpireAfterSeconds);
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
        kafkaReplicationFactor,
        kafkaSslCACertFilePath);

    return new ScribeLambdaFactory(
        mongoManager,
        collection,
        scribeDeltas,
        producer,
        tenantManager,
        DefaultServiceConfiguration,
        enableWholeSummaryUpload);
}

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    // Nconf has problems with prototype methods which prevents us from storing this as a class
    config.set("documentLambda", { create: scribeCreate });
    return createDocumentRouter(config);
}
