/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import fs from "fs";
import { LocalOrdererManager } from "@fluidframework/server-local-server";
import { DocumentStorage } from "@fluidframework/server-services-shared";
import { generateToken, Historian } from "@fluidframework/server-services-client";
import { MongoDatabaseManager, MongoManager, IResourcesFactory } from "@fluidframework/server-services-core";
import * as utils from "@fluidframework/server-services-utils";
import * as git from "isomorphic-git";
import { Provider } from "nconf";
import { Server } from "socket.io";

import winston from "winston";
import { TinyliciousResources } from "./resources";
import {
    PubSubPublisher,
    TaskMessageSender,
    TenantManager,
    TinyliciousDbFactoryFactory,
    WebServerFactory,
} from "./services";

const defaultTinyliciousPort = 7070;

export class TinyliciousResourcesFactory implements IResourcesFactory<TinyliciousResources> {
    public async create(config: Provider): Promise<TinyliciousResources> {
        // Pull in the default port off the config
        const port = utils.normalizePort(process.env.PORT ?? defaultTinyliciousPort);
        const collectionNames = config.get("mongo:collectionNames");

        const tenantManager = new TenantManager(`http://localhost:${port}`);
        const dbFactoryFactory = new TinyliciousDbFactoryFactory(config);

        const dbFactory = await dbFactoryFactory.create();
        const taskMessageSender = new TaskMessageSender();
        const mongoManager = new MongoManager(dbFactory);
        const databaseManager = new MongoDatabaseManager(
            mongoManager,
            collectionNames.nodes,
            collectionNames.documents,
            collectionNames.deltas,
            collectionNames.scribeDeltas);
        const storage = new DocumentStorage(databaseManager, tenantManager, false);
        const io = new Server({
            // enable compatibility with socket.io v2 clients
            // https://socket.io/docs/v4/client-installation/
            allowEIO3: true,
        });
        const pubsub = new PubSubPublisher(io);
        const webServerFactory = new WebServerFactory(io);

        // Initialize isomorphic-git
        git.plugins.set("fs", fs);

        const orderManager = new LocalOrdererManager(
            storage,
            databaseManager,
            tenantManager,
            taskMessageSender,
            config.get("foreman:permissions"),
            generateToken,
            async (tenantId: string) => {
                const url = `http://localhost:${port}/repos/${encodeURIComponent(tenantId)}`;
                return new Historian(url, false, false);
            },
            winston,
            undefined /* serviceConfiguration */,
            pubsub);

        return new TinyliciousResources(
            config,
            orderManager,
            tenantManager,
            storage,
            mongoManager,
            port,
            webServerFactory);
    }
}
