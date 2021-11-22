/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { CopierLambdaFactory } from "@fluidframework/server-lambdas";
import * as services from "@fluidframework/server-services";
import { IPartitionLambdaFactory, MongoManager } from "@fluidframework/server-services-core";
import { Provider } from "nconf";

// Establish a connection to Mongo, get the 'rawdeltas' collection and invoke
// the rest of the Copier instantiation:
export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const mongoUrl = config.get("mongo:operationsDbEndpoint") as string;
    const bufferMaxEntries = config.get("mongo:bufferMaxEntries") as number | undefined;
    const collectionName = config.get("mongo:collectionNames:rawdeltas");
    const mongoFactory = new services.MongoDbFactory(mongoUrl, bufferMaxEntries);
    const mongoManager = new MongoManager(mongoFactory, false);

    const db = await mongoManager.getDatabase();
    const collection = db.collection(collectionName);

    // The rawdeltas collection uses the IRawOperationMessageBatch type, which
    // is ordered by its index property:
    await collection.createIndex(
        {
            documentId: 1,
            index: 1,
            tenantId: 1,
        },
        true);

    return new CopierLambdaFactory(mongoManager, collection);
}
