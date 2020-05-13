/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import { DocumentStorage } from "@microsoft/fluid-server-services";
import { MongoDatabaseManager, MongoManager } from "@microsoft/fluid-server-services-core";
import utils from "@microsoft/fluid-server-services-utils";
import bytes from "bytes";
import git from "isomorphic-git";
import { Provider } from "nconf";
import socketIo from "socket.io";
import { Historian } from "@microsoft/fluid-server-services-client";
import { TinyliciousResources } from "./resources";
import {
    DbFactory,
    OrdererManager,
    TaskMessageSender,
    TenantManager,
    WebServerFactory,
} from "./services";

export class TinyliciousResourcesFactory implements utils.IResourcesFactory<TinyliciousResources> {
    public async create(config: Provider): Promise<TinyliciousResources> {
        // Pull in the default port off the config
        const port = utils.normalizePort(process.env.PORT || "3000");
        const maxSendMessageSize = bytes.parse(config.get("alfred:maxMessageSize"));
        const collectionNames = config.get("mongo:collectionNames");

        const tenantManager = new TenantManager();
        const dbFactory = new DbFactory(config);
        const taskMessageSender = new TaskMessageSender();
        const mongoManager = new MongoManager(dbFactory);
        const databaseManager = new MongoDatabaseManager(
            mongoManager,
            collectionNames.nodes,
            collectionNames.documents,
            collectionNames.deltas,
            collectionNames.scribeDeltas);
        const storage = new DocumentStorage(databaseManager, tenantManager, null);
        const io = socketIo();
        const webServerFactory = new WebServerFactory(io);

        // Initialize isomorphic-git
        git.plugins.set("fs", fs);

        const orderManager = new OrdererManager(
            storage,
            databaseManager,
            tenantManager,
            taskMessageSender,
            config.get("foreman:permissions"),
            maxSendMessageSize,
            async (tenantId: string) => {
                const url = `http://localhost:${port}/repos/${encodeURIComponent(tenantId)}`;
                return new Historian(url, false, false);
            });

        // TODO would be nicer to just pass the mongoManager down
        const db = await mongoManager.getDatabase();
        const contentCollection = db.collection(collectionNames.content);

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
