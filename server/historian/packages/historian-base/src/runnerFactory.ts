/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import * as services from "@fluidframework/server-services";
import * as core from "@fluidframework/server-services-core";
import * as utils from "@fluidframework/server-services-utils";
import { Provider } from "nconf";
import * as redis from "redis";
import * as historianServices from "./services";
import { normalizePort } from "./utils";
import { HistorianRunner } from "./runner";

export class HistorianResources implements utils.IResources {
    public webServerFactory: core.IWebServerFactory;

    constructor(
        public readonly config: Provider,
        public readonly port: string | number,
        public readonly riddler: historianServices.ITenantService,
        public readonly cache: historianServices.RedisCache,
    ) {
        this.webServerFactory = new services.BasicWebServerFactory();
    }

    public async dispose(): Promise<void> {
        return;
    }
}

export class HistorianResourcesFactory implements utils.IResourcesFactory<HistorianResources> {
    public async create(config: Provider): Promise<HistorianResources> {
        const redisConfig = config.get("redis");
        const redisOptions: redis.ClientOpts = { password: redisConfig.pass };
        if (redisConfig.tls) {
            redisOptions.tls = {
                serverName: redisConfig.host,
            };
        }

        const redisClient = redis.createClient(
            redisConfig.port,
            redisConfig.host,
            redisOptions);
        const gitCache = new historianServices.RedisCache(redisClient);
        const tenantCache = new historianServices.RedisTenantCache(redisClient);
        // Create services
        const riddlerEndpoint = config.get("riddler");
        const riddler = new historianServices.RiddlerService(riddlerEndpoint, tenantCache);

        const port = normalizePort(process.env.PORT || "3000");

        return new HistorianResources(config, port, riddler, gitCache);
    }
}

export class HistorianRunnerFactory implements utils.IRunnerFactory<HistorianResources> {
    public async create(resources: HistorianResources): Promise<utils.IRunner> {
        return new HistorianRunner(
            resources.webServerFactory,
            resources.config,
            resources.port,
            resources.riddler,
            resources.cache);
    }
}
