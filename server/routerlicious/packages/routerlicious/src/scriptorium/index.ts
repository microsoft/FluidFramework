/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScriptoriumLambdaFactory } from "@fluidframework/server-lambdas";
import * as services from "@fluidframework/server-services";
import { IPartitionLambdaFactory, MongoManager } from "@fluidframework/server-services-core";
import { Provider } from "nconf";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const mongoUrl = config.get("mongo:endpoint") as string;
    const mongoExpireAfterSeconds = config.get("mongo:expireAfterSeconds") as number;
    const deltasCollectionName = config.get("mongo:collectionNames:deltas");
    const mongoFactory = new services.MongoDbFactory(mongoUrl);
    const mongoManager = new MongoManager(mongoFactory, false);

    const db = await mongoManager.getDatabase();
    const opCollection = db.collection(deltasCollectionName);
    await opCollection.createIndex(
        {
            "documentId": 1,
            "operation.term": 1,
            "operation.sequenceNumber": 1,
            "tenantId": 1,
        },
        true);

    if (mongoExpireAfterSeconds > 0) {
        await opCollection.createTTLIndex(
            {
                mongoTimestamp: 1,
            },
            mongoExpireAfterSeconds,
        );
    }

    return new ScriptoriumLambdaFactory(mongoManager, opCollection);
}
