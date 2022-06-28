/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AsyncLocalStorage } from "async_hooks";
import * as services from "@fluidframework/server-services";
import * as core from "@fluidframework/server-services-core";
import { Provider } from "nconf";
import Redis from "ioredis";
import winston from "winston";
import * as historianServices from "./services";
import { normalizePort } from "./utils";
import { HistorianRunner } from "./runner";

export class HistorianResources implements core.IResources {
    public webServerFactory: core.IWebServerFactory;

    constructor(
        public readonly config: Provider,
        public readonly port: string | number,
        public readonly riddler: historianServices.ITenantService,
        public readonly throttler: core.IThrottler,
        public readonly cache?: historianServices.RedisCache,
        public readonly asyncLocalStorage?: AsyncLocalStorage<string>) {
        this.webServerFactory = new services.BasicWebServerFactory();
    }

    public async dispose(): Promise<void> {
        return;
    }
}

export class HistorianResourcesFactory implements core.IResourcesFactory<HistorianResources> {
    public async create(config: Provider): Promise<HistorianResources> {
        const redisConfig = config.get("redis");
        const redisOptions: Redis.RedisOptions = {
            host: redisConfig.host,
            port: redisConfig.port,
            password: redisConfig.pass,
        };
        if (redisConfig.tls) {
            redisOptions.tls = {
                servername: redisConfig.host,
            };
        }

        const redisParams = {
            expireAfterSeconds: redisConfig.keyExpireAfterSeconds as number | undefined,
        };

        const redisClient = new Redis(redisOptions);
        const disableGitCache = config.get("restGitService:disableGitCache") as boolean | undefined;
        const gitCache = disableGitCache ? undefined : new historianServices.RedisCache(redisClient, redisParams);
        const tenantCache = new historianServices.RedisTenantCache(redisClient, redisParams);
        // Create services
        const riddlerEndpoint = config.get("riddler");
        const asyncLocalStorage = config.get("asyncLocalStorageInstance")?.[0];
        const riddler = new historianServices.RiddlerService(riddlerEndpoint, tenantCache, asyncLocalStorage);

        // Redis connection for throttling.
        const redisConfigForThrottling = config.get("redisForThrottling");
        const redisOptionsForThrottling: Redis.RedisOptions = {
            host: redisConfigForThrottling.host,
            port: redisConfigForThrottling.port,
            password: redisConfigForThrottling.pass,
        };
        if (redisConfigForThrottling.tls) {
            redisOptionsForThrottling.tls = {
                servername: redisConfigForThrottling.host,
            };
        }
        const redisClientForThrottling = new Redis(redisOptionsForThrottling);
        const redisParamsForThrottling = {
            expireAfterSeconds: redisConfigForThrottling.keyExpireAfterSeconds as number | undefined,
        };

        const throttleMaxRequestsPerMs = config.get("throttling:maxRequestsPerMs") as number | undefined;
        const throttleMaxRequestBurst = config.get("throttling:maxRequestBurst") as number | undefined;
        const throttleMinCooldownIntervalInMs = config.get("throttling:minCooldownIntervalInMs") as number | undefined;
        const minThrottleIntervalInMs = config.get("throttling:minThrottleIntervalInMs") as number | undefined;
        const throttleStorageManager =
            new services.RedisThrottleAndUsageStorageManager(redisClientForThrottling, redisParamsForThrottling);
        const throttlerHelper = new services.ThrottlerHelper(
            throttleStorageManager,
            throttleMaxRequestsPerMs,
            throttleMaxRequestBurst,
            throttleMinCooldownIntervalInMs);
        const throttler = new services.Throttler(throttlerHelper, minThrottleIntervalInMs, winston);

        const port = normalizePort(process.env.PORT || "3000");

        return new HistorianResources(config, port, riddler, throttler, gitCache, asyncLocalStorage);
    }
}

export class HistorianRunnerFactory implements core.IRunnerFactory<HistorianResources> {
    public async create(resources: HistorianResources): Promise<core.IRunner> {
        return new HistorianRunner(
            resources.webServerFactory,
            resources.config,
            resources.port,
            resources.riddler,
            resources.throttler,
            resources.cache,
            resources.asyncLocalStorage);
    }
}
