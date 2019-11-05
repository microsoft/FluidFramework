/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CopierLambdaFactory } from "@microsoft/fluid-server-lambdas";
import * as services from "@microsoft/fluid-server-services";
import { IPartitionLambdaFactory, MongoManager } from "@microsoft/fluid-server-services-core";
import { Provider } from "nconf";

// Establish a connection to Mongo, get the 'rawdeltas' collection and invoke
// the rest of the Copier instantiation:
export async function create(config: Provider): Promise<IPartitionLambdaFactory> {
    const mongoUrl = config.get("mongo:endpoint") as string;
    const collectionName = config.get("mongo:collectionNames:rawdeltas");
    const mongoFactory = new services.MongoDbFactory(mongoUrl);
    const mongoManager = new MongoManager(mongoFactory, false);

    const db = await mongoManager.getDatabase();
    const collection = db.collection(collectionName);

    // Each document in the collection is identified by: (Fluid-)document
    // id, tenant id, and payload (which is handled automatically?).
    await collection.createIndex(
        {
            "documentId": 1,
            "operation.referenceSequenceNumber": 1,
            "tenantId": 1,
        },
        true);

    return new CopierLambdaFactory(mongoManager, collection);
}
