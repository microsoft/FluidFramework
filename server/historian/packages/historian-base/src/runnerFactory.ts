/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { AsyncLocalStorage } from "async_hooks";
import * as services from "@fluidframework/server-services";
import * as core from "@fluidframework/server-services-core";
import * as utils from "@fluidframework/server-services-utils";
import { Provider } from "nconf";
import * as Redis from "ioredis";
import winston from "winston";
import * as historianServices from "./services";
import { normalizePort, Constants } from "./utils";
import { HistorianRunner } from "./runner";
import { IHistorianResourcesCustomizations } from "./customizations";

export class HistorianResources implements core.IResources {
	public webServerFactory: core.IWebServerFactory;

	constructor(
		public readonly config: Provider,
		public readonly port: string | number,
		public readonly riddler: historianServices.ITenantService,
		public readonly storageNameRetriever: core.IStorageNameRetriever,
		public readonly restTenantThrottlers: Map<string, core.IThrottler>,
		public readonly restClusterThrottlers: Map<string, core.IThrottler>,
		public readonly cache?: historianServices.RedisCache,
		public readonly asyncLocalStorage?: AsyncLocalStorage<string>,
		public tokenRevocationManager?: core.ITokenRevocationManager,
	) {
		this.webServerFactory = new services.BasicWebServerFactory();
	}

	public async dispose(): Promise<void> {
		if (this.tokenRevocationManager) {
			await this.tokenRevocationManager.close();
		}
		return;
	}
}

export class HistorianResourcesFactory implements core.IResourcesFactory<HistorianResources> {
	public async create(
		config: Provider,
		customizations: IHistorianResourcesCustomizations,
	): Promise<HistorianResources> {
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

		const redisClient = new Redis.default(redisOptions);
		const disableGitCache = config.get("restGitService:disableGitCache") as boolean | undefined;
		const gitCache = disableGitCache
			? undefined
			: new historianServices.RedisCache(redisClient, redisParams);
		const tenantCache = new historianServices.RedisTenantCache(redisClient, redisParams);
		// Create services
		const riddlerEndpoint = config.get("riddler");
		const asyncLocalStorage = config.get("asyncLocalStorageInstance")?.[0];
		const riddler = new historianServices.RiddlerService(
			riddlerEndpoint,
			tenantCache,
			asyncLocalStorage,
		);

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
		const redisClientForThrottling = new Redis.default(redisOptionsForThrottling);
		const redisParamsForThrottling = {
			expireAfterSeconds: redisConfigForThrottling.keyExpireAfterSeconds as
				| number
				| undefined,
		};

		const redisThrottleAndUsageStorageManager =
			new services.RedisThrottleAndUsageStorageManager(
				redisClientForThrottling,
				redisParamsForThrottling,
			);

		const configureThrottler = (
			throttleConfig: Partial<utils.IThrottleConfig>,
		): core.IThrottler => {
			const throttlerHelper = new services.ThrottlerHelper(
				redisThrottleAndUsageStorageManager,
				throttleConfig.maxPerMs,
				throttleConfig.maxBurst,
				throttleConfig.minCooldownIntervalInMs,
			);
			return new services.Throttler(
				throttlerHelper,
				throttleConfig.minThrottleIntervalInMs,
				winston,
				throttleConfig.maxInMemoryCacheSize,
				throttleConfig.maxInMemoryCacheAgeInMs,
				throttleConfig.enableEnhancedTelemetry,
			);
		};

		// Rest API Throttler
		const restApiTenantGeneralThrottleConfig = utils.getThrottleConfig(
			config.get("throttling:restCallsPerTenant:generalRestCall"),
		);
		const restTenantGeneralThrottler = configureThrottler(restApiTenantGeneralThrottleConfig);

		const restApiTenantGetSummaryThrottleConfig = utils.getThrottleConfig(
			config.get("throttling:restCallsPerTenant:getSummary"),
		);
		const restTenantGetSummaryThrottler = configureThrottler(
			restApiTenantGetSummaryThrottleConfig,
		);

		const restApiTenantCreateSummaryThrottleConfig = utils.getThrottleConfig(
			config.get("throttling:restCallsPerTenant:createSummary"),
		);
		const restTenantCreateSummaryThrottler = configureThrottler(
			restApiTenantCreateSummaryThrottleConfig,
		);

		const restTenantThrottlers = new Map<string, core.IThrottler>();
		restTenantThrottlers.set(
			Constants.createSummaryThrottleIdPrefix,
			restTenantCreateSummaryThrottler,
		);
		restTenantThrottlers.set(
			Constants.getSummaryThrottleIdPrefix,
			restTenantGetSummaryThrottler,
		);
		restTenantThrottlers.set(
			Constants.generalRestCallThrottleIdPrefix,
			restTenantGeneralThrottler,
		);

		const restApiClusterCreateSummaryThrottleConfig = utils.getThrottleConfig(
			config.get("throttling:restCallsPerCluster:createSummary"),
		);
		const throttlerCreateSummaryPerCluster = configureThrottler(
			restApiClusterCreateSummaryThrottleConfig,
		);

		const restApiClusterGetSummaryThrottleConfig = utils.getThrottleConfig(
			config.get("throttling:restCallsPerCluster:getSummary"),
		);
		const throttlerGetSummaryPerCluster = configureThrottler(
			restApiClusterGetSummaryThrottleConfig,
		);

		const restClusterThrottlers = new Map<string, core.IThrottler>();
		restClusterThrottlers.set(
			Constants.createSummaryThrottleIdPrefix,
			throttlerCreateSummaryPerCluster,
		);
		restClusterThrottlers.set(
			Constants.getSummaryThrottleIdPrefix,
			throttlerGetSummaryPerCluster,
		);
		const storagePerDocEnabled = (config.get("storage:perDocEnabled") as boolean) ?? false;
		const storageNameRetriever = storagePerDocEnabled
			? customizations?.storageNameRetriever ?? new services.StorageNameRetriever()
			: undefined;

		const port = normalizePort(process.env.PORT || "3000");

		return new HistorianResources(
			config,
			port,
			riddler,
			storageNameRetriever,
			restTenantThrottlers,
			restClusterThrottlers,
			gitCache,
			asyncLocalStorage,
		);
	}
}

export class HistorianRunnerFactory implements core.IRunnerFactory<HistorianResources> {
	public async create(resources: HistorianResources): Promise<core.IRunner> {
		return new HistorianRunner(
			resources.webServerFactory,
			resources.config,
			resources.port,
			resources.riddler,
			resources.storageNameRetriever,
			resources.restTenantThrottlers,
			resources.restClusterThrottlers,
			resources.cache,
			resources.asyncLocalStorage,
			resources.tokenRevocationManager,
		);
	}
}
