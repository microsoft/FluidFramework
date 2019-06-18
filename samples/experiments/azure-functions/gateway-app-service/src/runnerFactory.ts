/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as services from "@prague/services";
import * as core from "@prague/services-core";
import * as utils from "@prague/services-utils";
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

        // Redis connection
        const options: any = { auth_pass: redisConfig.key };
        if (config.get("redis:tls")) {
            options.tls = {
                servername: redisConfig.host,
            };
        }
        const redisClient = redis.createClient(redisConfig.port, redisConfig.host, options);
        const redisCache = new services.RedisCache(redisClient);

        // Tenants attached to the apps this service exposes
        const appTenants = config.get("gateway:tenants") as Array<{ id: string, key: string }>;

        // This wanst to create stuff
        const port = utils.normalizePort(process.env.PORT || "3000");

        const alfred = new Alfred(
            appTenants,
            config.get("worker:alfredUrl"),
            config.get("worker:blobStorageUrl"));

        return new GatewayResources(
            config,
            redisConfig,
            alfred,
            redisCache,
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
            resources.alfred,
            resources.appTenants);
    }
}
