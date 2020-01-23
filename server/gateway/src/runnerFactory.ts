/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as services from "@microsoft/fluid-server-services";
import * as core from "@microsoft/fluid-server-services-core";
import * as utils from "@microsoft/fluid-server-services-utils";
import { Provider } from "nconf";
import * as redis from "redis";
import { Alfred } from "./alfred";
import { GatewayRunner } from "./runner";

export class GatewayResources implements utils.IResources {
    public webServerFactory: core.IWebServerFactory;

    constructor(
        public config: Provider,
        public redisConfig: any,
        public alfred: Alfred,
        public cache: core.ICache,
        public mongoManager: core.MongoManager,
        public accountsCollectionName: string,
        public appTenants: core.IAlfredTenant[],
        public port: any,
    ) {
        this.webServerFactory = new services.SocketIoWebServerFactory(this.redisConfig);
    }

    public async dispose(): Promise<void> {
        return;
    }
}

export class GatewayResourcesFactory implements utils.IResourcesFactory<GatewayResources> {
    public async create(config: Provider): Promise<GatewayResources> {
        // Producer used to publish messages
        const redisConfig = config.get("redis");
        // eslint-disable-next-line @typescript-eslint/camelcase
        const options: redis.ClientOpts = { auth_pass: redisConfig.pass };
        if (redisConfig.tls) {
            options.tls = {
                servername: redisConfig.host,
            };
        }

        // Database connection
        const mongoUrl = config.get("mongo:endpoint") as string;
        const mongoFactory = new services.MongoDbFactory(mongoUrl);
        const mongoManager = new core.MongoManager(mongoFactory);
        const accountsCollectionName = config.get("mongo:collectionNames:accounts");

        // create the index on the documents collection
        const db = await mongoManager.getDatabase();
        const documentsCollection = db.collection<core.IDocument>(accountsCollectionName);
        await documentsCollection.createIndex(
            {
                userId: 1,
            },
            false);

        // Redis connection
        const redisClient = redis.createClient(redisConfig.port, redisConfig.host, options);
        const redisCache = new services.RedisCache(redisClient);

        // Tenants attached to the apps this service exposes
        const appTenants = config.get("gateway:tenants") as { id: string; key: string }[];

        // This wanst to create stuff
        const port = utils.normalizePort(process.env.PORT || "3000");

        const alfred = new Alfred(
            appTenants,
            config.get("worker:alfredUrl"),
            config.get("worker:blobStorageUrl"),
            config.get("gateway:auth:endpoint"));

        return new GatewayResources(
            config,
            redisConfig,
            alfred,
            redisCache,
            mongoManager,
            accountsCollectionName,
            appTenants,
            port);
    }
}

export class GatewayRunnerFactory implements utils.IRunnerFactory<GatewayResources> {
    public async create(resources: GatewayResources): Promise<utils.IRunner> {
        return new GatewayRunner(
            resources.webServerFactory,
            resources.config,
            resources.port,
            resources.cache,
            resources.mongoManager,
            resources.accountsCollectionName,
            resources.alfred,
            resources.appTenants);
    }
}
