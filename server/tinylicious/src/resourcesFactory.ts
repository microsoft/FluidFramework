/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { MongoDatabaseManager, MongoManager } from "@microsoft/fluid-server-services-core";
import * as utils from "@microsoft/fluid-server-services-utils";
import * as bytes from "bytes";
import { Provider } from "nconf";
import { TinyliciousResources } from "./resources";
import {
    DbFactory,
    DocumentStorage,
    OrdererManager,
    TaskMessageSender,
    TenantManager,
    WebServerFactory,
} from "./services";

export class TinyliciousResourcesFactory implements utils.IResourcesFactory<TinyliciousResources> {
    public async create(config: Provider): Promise<TinyliciousResources> {
        // pull in the default port off the config
        const port = utils.normalizePort(process.env.PORT || "3000");
        const maxSendMessageSize = bytes.parse(config.get("alfred:maxMessageSize"));
        const collectionNames = config.get("mongo:collectionNames");

        const tenantManager = new TenantManager();
        const storage = new DocumentStorage();
        const dbFactory = new DbFactory();
        const taskMessageSender = new TaskMessageSender();
        const mongoManager = new MongoManager(dbFactory);
        const databaseManager = new MongoDatabaseManager(
            mongoManager,
            collectionNames.nodes,
            collectionNames.documents,
            collectionNames.deltas,
            collectionNames.scribeDeltas);

        const orderManager = new OrdererManager(
            storage,
            databaseManager,
            tenantManager,
            taskMessageSender,
            config.get("foreman"),
            maxSendMessageSize);

        // TODO would be nicer to just pass the mongoManager down
        const db = await mongoManager.getDatabase();
        const contentCollection = db.collection(collectionNames.content);

        const webServerFactory = new WebServerFactory();

        return new TinyliciousResources(
            config,
            orderManager,
            tenantManager,
            storage,
            mongoManager,
            port,
            contentCollection,
            webServerFactory);
    }
}
