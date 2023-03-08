/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScriptoriumLambdaFactory } from "@fluidframework/server-lambdas";
import * as services from "@fluidframework/server-services";
import { IPartitionLambdaFactory, MongoManager } from "@fluidframework/server-services-core";
import { Provider } from "nconf";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const mongoExpireAfterSeconds = config.get("mongo:expireAfterSeconds") as number;
    const deltasCollectionName = config.get("mongo:collectionNames:deltas");
    const createCosmosDBIndexes = config.get("mongo:createCosmosDBIndexes") as boolean;

    const enableTelemetry = config.get("scriptorium:enableTelemetry") as boolean ?? false;

    // Database connection for global db if enabled
    const factory = await services.getDbFactory(config);

    const operationsDbManager = new MongoManager(factory, false);
    const operationsDb = await operationsDbManager.getDatabase();

    const opCollection = operationsDb.collection(deltasCollectionName);

    if (createCosmosDBIndexes) {
        await opCollection.createIndex({ tenantId: 1 }, false);
        await opCollection.createIndex({ documentId: 1 }, false);
        await opCollection.createIndex({ "operation.term": 1 }, false);
        await opCollection.createIndex({ "operation.timestamp": 1 }, false);
        await opCollection.createIndex({ scheduledDeletionTime: 1 }, false);
        await opCollection.createIndex({ "operation.sequenceNumber": 1 }, false);
    } else {
        await opCollection.createIndex(
            {
                "documentId": 1,
                "operation.term": 1,
                "operation.sequenceNumber": 1,
                "tenantId": 1,
            },
            true);
    }

    if (mongoExpireAfterSeconds > 0) {
        await (createCosmosDBIndexes
            ? opCollection.createTTLIndex({ _ts: 1 }, mongoExpireAfterSeconds)
            : opCollection.createTTLIndex({ mongoTimestamp: 1 }, mongoExpireAfterSeconds));
    }

    return new ScriptoriumLambdaFactory(operationsDbManager, opCollection, { enableTelemetry });
}
