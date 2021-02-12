/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { AsyncLocalStorage } from "async_hooks";
import * as services from "@fluidframework/server-services";
import * as core from "@fluidframework/server-services-core";
import * as utils from "@fluidframework/server-services-utils";
import { Provider } from "nconf";
import * as redis from "redis";
import winston from "winston";
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
        public readonly throttler: core.IThrottler,
        public readonly asyncLocalStorage: AsyncLocalStorage<string>) {
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
        const asyncLocalStorage = config.get("asyncLocalStorageInstance");
        const riddler = new historianServices.RiddlerService(riddlerEndpoint, tenantCache, asyncLocalStorage);

        // Redis connection for throttling.
        const redisConfigForThrottling = config.get("redisForThrottling");
        const redisOptionsForThrottling: redis.ClientOpts = { password: redisConfigForThrottling.pass };
        if (redisConfigForThrottling.tls) {
            redisOptionsForThrottling.tls = {
                serverName: redisConfigForThrottling.host,
            };
        }
        const redisClientForThrottling = redis.createClient(
            redisConfigForThrottling.port,
            redisConfigForThrottling.host,
            redisOptionsForThrottling);

        const throttleMaxRequestsPerMs = config.get("throttling:maxRequestsPerMs") as number | undefined;
        const throttleMaxRequestBurst = config.get("throttling:maxRequestBurst") as number | undefined;
        const throttleMinCooldownIntervalInMs = config.get("throttling:minCooldownIntervalInMs") as number | undefined;
        const minThrottleIntervalInMs = config.get("throttling:minThrottleIntervalInMs") as number | undefined;
        const throttleStorageManager = new services.RedisThrottleStorageManager(redisClientForThrottling);
        const throttlerHelper = new services.ThrottlerHelper(
            throttleStorageManager,
            throttleMaxRequestsPerMs,
            throttleMaxRequestBurst,
            throttleMinCooldownIntervalInMs);
        const throttler = new services.Throttler(throttlerHelper, minThrottleIntervalInMs, winston);

        const port = normalizePort(process.env.PORT || "3000");

        return new HistorianResources(config, port, riddler, gitCache, throttler, asyncLocalStorage);
    }
}

export class HistorianRunnerFactory implements utils.IRunnerFactory<HistorianResources> {
    public async create(resources: HistorianResources): Promise<utils.IRunner> {
        return new HistorianRunner(
            resources.webServerFactory,
            resources.config,
            resources.port,
            resources.riddler,
            resources.cache,
            resources.throttler,
            resources.asyncLocalStorage);
    }
}
