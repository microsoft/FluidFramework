/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScriptoriumLambdaFactory } from "@microsoft/fluid-server-lambdas";
import * as services from "@microsoft/fluid-server-services";
import { IPartitionLambdaFactory, MongoManager } from "@microsoft/fluid-server-services-core";
import { Provider } from "nconf";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const mongoUrl = config.get("mongo:endpoint") as string;
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

    const contentCollection = db.collection("content");
    await contentCollection.createIndex(
        {
            documentId: 1,
            sequenceNumber: 1,
            tenantId: 1,
        },
        false);

    return new ScriptoriumLambdaFactory(mongoManager, opCollection, contentCollection);
}
