/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScribeLambdaFactory } from "@fluidframework/server-lambdas";
import { createDocumentRouter } from "@fluidframework/server-routerlicious-base";
import { createProducer, getDbFactory, TenantManager } from "@fluidframework/server-services";
import {
    DefaultServiceConfiguration,
    IDb,
    IDocument,
    IPartitionLambdaFactory,
    ISequencedOperationMessage,
    IServiceConfiguration,
    MongoManager,
} from "@fluidframework/server-services-core";
import { Provider } from "nconf";

export async function scribeCreate(config: Provider): Promise<IPartitionLambdaFactory> {
    // Access config values
    const globalDbEnabled = config.get("mongo:globalDbEnabled") as boolean;
    const documentsCollectionName = config.get("mongo:collectionNames:documents");
    const messagesCollectionName = config.get("mongo:collectionNames:scribeDeltas");
    const createCosmosDBIndexes = config.get("mongo:createCosmosDBIndexes");

    const kafkaEndpoint = config.get("kafka:lib:endpoint");
    const kafkaLibrary = config.get("kafka:lib:name");
    const kafkaProducerPollIntervalMs = config.get("kafka:lib:producerPollIntervalMs");
    const kafkaNumberOfPartitions = config.get("kafka:lib:numberOfPartitions");
    const kafkaReplicationFactor = config.get("kafka:lib:replicationFactor");
    const kafkaMaxBatchSize = config.get("kafka:lib:maxBatchSize");
    const kafkaSslCACertFilePath: string = config.get("kafka:lib:sslCACertFilePath");
    const sendTopic = config.get("lambdas:deli:topic");
    const kafkaClientId = config.get("scribe:kafkaClientId");
    const mongoExpireAfterSeconds = config.get("mongo:expireAfterSeconds") as number;
    const enableWholeSummaryUpload = config.get("storage:enableWholeSummaryUpload") as boolean;
    const internalHistorianUrl = config.get("worker:internalBlobStorageUrl");

    // Generate tenant manager which abstracts access to the underlying storage provider
    const authEndpoint = config.get("auth:endpoint");
    const tenantManager = new TenantManager(authEndpoint, internalHistorianUrl);

    const factory = await getDbFactory(config);

    let globalDb;
    if (globalDbEnabled) {
        const globalDbReconnect = config.get("mongo:globalDbReconnect") as boolean ?? false;
        const globalDbMongoManager = new MongoManager(factory, globalDbReconnect, null, true);
        globalDb = await globalDbMongoManager.getDatabase();
    }

    const operationsDbManager = new MongoManager(factory, false);
    const operationsDb = await operationsDbManager.getDatabase();

    const documentsCollectionDb: IDb = globalDbEnabled ? globalDb : operationsDb;

    const [collection, scribeDeltas] = await Promise.all([
        documentsCollectionDb.collection<IDocument>(documentsCollectionName),
        operationsDb.collection<ISequencedOperationMessage>(messagesCollectionName),
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
        await (createCosmosDBIndexes
            ? scribeDeltas.createTTLIndex({ _ts: 1 }, mongoExpireAfterSeconds)
            : scribeDeltas.createTTLIndex({ mongoTimestamp: 1 }, mongoExpireAfterSeconds));
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
        kafkaMaxBatchSize,
        kafkaSslCACertFilePath);

    const externalOrdererUrl = config.get("worker:serverUrl");
    const enforceDiscoveryFlow: boolean = config.get("worker:enforceDiscoveryFlow");
    const serviceConfiguration: IServiceConfiguration = {
        ...DefaultServiceConfiguration,
        externalOrdererUrl,
        enforceDiscoveryFlow,
    };

    return new ScribeLambdaFactory(
        operationsDbManager,
        collection,
        scribeDeltas,
        producer,
        tenantManager,
        serviceConfiguration,
        enableWholeSummaryUpload);
}

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    // Nconf has problems with prototype methods which prevents us from storing this as a class
    config.set("documentLambda", { create: scribeCreate });
    return createDocumentRouter(config);
}
