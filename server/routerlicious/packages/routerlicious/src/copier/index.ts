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
    const collectionName = config.get("mongo:collectionNames:rawdeltas");

    const factory = await services.getDbFactory(config);
    const dbManager = new MongoManager(factory, false);
    const db = await dbManager.getDatabase();

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

    return new CopierLambdaFactory(dbManager, collection);
}
