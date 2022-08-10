/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScriptoriumLambdaFactory } from "@fluidframework/server-lambdas";
import * as services from "@fluidframework/server-services";
import { ICollection, IDocument, IPartitionLambdaFactory, MongoManager } from "@fluidframework/server-services-core";
import { deleteSummarizedOps, executeOnInterval, FluidServiceErrorCode } from "@fluidframework/server-services-utils";
import { Provider } from "nconf";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const globalDbEnabled = config.get("mongo:globalDbEnabled") as boolean;
    const mongoExpireAfterSeconds = config.get("mongo:expireAfterSeconds") as number;
    const deltasCollectionName = config.get("mongo:collectionNames:deltas");
    const documentsCollectionName = config.get("mongo:collectionNames:documents");
    const createCosmosDBIndexes = config.get("mongo:createCosmosDBIndexes") as boolean;

    const softDeletionRetentionPeriodMs = config.get("mongo:softDeletionRetentionPeriodMs") as number;
    const offlineWindowMs = config.get("mongo:offlineWindowMs") as number;
    const softDeletionEnabled = config.get("mongo:softDeletionEnabled") as boolean;
    const permanentDeletionEnabled = config.get("mongo:permanentDeletionEnabled") as boolean;
    const deletionIntervalMs = config.get("mongo:deletionIntervalMs") as number;

    // Database connection for global db if enabled
    const factory = await services.getDbFactory(config);

    let globalDb;
    if (globalDbEnabled) {
        const globalDbReconnect = config.get("mongo:globalDbReconnect") as boolean ?? false;
        const globalDbMongoManager = new MongoManager(factory, globalDbReconnect, null, true);
        globalDb = await globalDbMongoManager.getDatabase();
    }

    const operationsDbManager = new MongoManager(factory, false);
    const operationsDb = await operationsDbManager.getDatabase();

    const documentsCollectionDb = globalDbEnabled ? globalDb : operationsDb;

    const documentsCollection: ICollection<IDocument> = documentsCollectionDb.collection(documentsCollectionName);
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
        if (createCosmosDBIndexes) {
            await opCollection.createTTLIndex({ _ts: 1 }, mongoExpireAfterSeconds);
        } else {
            await opCollection.createTTLIndex(
                {
                    mongoTimestamp: 1,
                },
                mongoExpireAfterSeconds,
            );
        }
    }

    executeOnInterval(
        async () => deleteSummarizedOps(
            opCollection,
            documentsCollection,
            softDeletionRetentionPeriodMs,
            offlineWindowMs,
            softDeletionEnabled,
            permanentDeletionEnabled),
        deletionIntervalMs,
        "deleteSummarizedOps",
        undefined,
        (error) => { return error.code === FluidServiceErrorCode.FeatureDisabled; },
    );

    return new ScriptoriumLambdaFactory(operationsDbManager, opCollection);
}
