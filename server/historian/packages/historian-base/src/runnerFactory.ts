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
		public readonly documentManager: core.IDocumentManager,
		public readonly cache?: historianServices.RedisCache,
		public readonly asyncLocalStorage?: AsyncLocalStorage<string>,
		public revokedTokenChecker?: core.IRevokedTokenChecker,
		public readonly denyList?: historianServices.IDenyList,
	) {
		const httpServerConfig: services.IHttpServerConfig = config.get("system:httpServer");
		this.webServerFactory = new services.BasicWebServerFactory(httpServerConfig);
	}

	public async dispose(): Promise<void> {
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
			connectTimeout: redisConfig.connectTimeout,
			enableReadyCheck: true,
			maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
			enableOfflineQueue: redisConfig.enableOfflineQueue,
			retryStrategy: utils.getRedisClusterRetryStrategy({
				delayPerAttemptMs: 50,
				maxDelayMs: 2000,
			}),
		};
		if (redisConfig.enableAutoPipelining) {
			/**
			 * When enabled, all commands issued during an event loop iteration are automatically wrapped in a
			 * pipeline and sent to the server at the same time. This can improve performance by 30-50%.
			 * More info: https://github.com/luin/ioredis#autopipelining
			 */
			redisOptions.enableAutoPipelining = true;
			redisOptions.autoPipeliningIgnoredCommands = ["ping"];
		}
		if (redisConfig.tls) {
			redisOptions.tls = {
				servername: redisConfig.host,
			};
		}

		const redisParams = {
			expireAfterSeconds: redisConfig.keyExpireAfterSeconds as number | undefined,
		};

		const redisClient: Redis.default | Redis.Cluster = utils.getRedisClient(
			redisOptions,
			redisConfig.slotsRefreshTimeout,
			redisConfig.enableClustering,
		);

		const disableGitCache = config.get("restGitService:disableGitCache") as boolean | undefined;
		const gitCache = disableGitCache
			? undefined
			: new historianServices.RedisCache(redisClient, redisParams);
		const tenantCache = new historianServices.RedisTenantCache(redisClient, redisParams);
		// Create services
		const riddlerEndpoint = config.get("riddler");
		const alfredEndpoint = config.get("alfred");
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
			connectTimeout: redisConfigForThrottling.connectTimeout,
			enableReadyCheck: true,
			maxRetriesPerRequest: redisConfigForThrottling.maxRetriesPerRequest,
			enableOfflineQueue: redisConfigForThrottling.enableOfflineQueue,
			retryStrategy: utils.getRedisClusterRetryStrategy({
				delayPerAttemptMs: 50,
				maxDelayMs: 2000,
			}),
		};
		if (redisConfigForThrottling.enableAutoPipelining) {
			/**
			 * When enabled, all commands issued during an event loop iteration are automatically wrapped in a
			 * pipeline and sent to the server at the same time. This can improve performance by 30-50%.
			 * More info: https://github.com/luin/ioredis#autopipelining
			 */
			redisOptionsForThrottling.enableAutoPipelining = true;
			redisOptionsForThrottling.autoPipeliningIgnoredCommands = ["ping"];
		}
		if (redisConfigForThrottling.tls) {
			redisOptionsForThrottling.tls = {
				servername: redisConfigForThrottling.host,
			};
		}
		const redisClientForThrottling: Redis.default | Redis.Cluster = utils.getRedisClient(
			redisOptionsForThrottling,
			redisConfigForThrottling.slotsRefreshTimeout,
			redisConfigForThrottling.enableClustering,
		);
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

		const tenantManager: core.ITenantManager = new services.TenantManager(
			riddlerEndpoint,
			undefined /* internalHistorianUrl */,
		);
		const documentManager: core.IDocumentManager = new services.DocumentManager(
			alfredEndpoint,
			tenantManager,
			gitCache,
		);

		const port = normalizePort(process.env.PORT || "3000");

		// Token revocation
		const revokedTokenChecker: core.IRevokedTokenChecker | undefined =
			customizations?.revokedTokenChecker ?? new utils.DummyRevokedTokenChecker();

		const denyListConfig = config.get("documentDenyList");
		const denyList: historianServices.IDenyList = new historianServices.DenyList(
			denyListConfig,
		);

		return new HistorianResources(
			config,
			port,
			riddler,
			storageNameRetriever,
			restTenantThrottlers,
			restClusterThrottlers,
			documentManager,
			gitCache,
			asyncLocalStorage,
			revokedTokenChecker,
			denyList,
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
			resources.documentManager,
			resources.cache,
			resources.asyncLocalStorage,
			resources.revokedTokenChecker,
			resources.denyList,
		);
	}
}
