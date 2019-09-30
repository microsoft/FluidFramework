/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CopierLambdaFactory } from "@microsoft/fluid-server-lambdas";
import * as services from "@microsoft/fluid-server-services";
import { IPartitionLambdaFactory, MongoManager } from "@microsoft/fluid-server-services-core";
import { Provider } from "nconf";

export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const mongoUrl = config.get("mongo:endpoint") as string;
    const rawDeltasCollectionName = config.get("mongo:collectionNames:rawdeltas");
    const mongoFactory = new services.MongoDbFactory(mongoUrl);
    const mongoManager = new MongoManager(mongoFactory, false);

    const db = await mongoManager.getDatabase();
    const rawOpCollection = db.collection(rawDeltasCollectionName);
    await rawOpCollection.createIndex(
        {
            documentId: 1,
            extendedSequenceNumber: 1,
            tenantId: 1,
        },
        true);

    return new CopierLambdaFactory(mongoManager, rawOpCollection);
}
