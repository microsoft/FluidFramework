/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AsyncLocalStorage } from "async_hooks";
import * as services from "@fluidframework/server-services";
import * as core from "@fluidframework/server-services-core";
import * as utils from "@fluidframework/server-services-utils";
import { Provider } from "nconf";
import winston from "winston";
import { RedisClientConnectionManager } from "@fluidframework/server-services-utils";
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
		const redisClientConnectionManager = customizations?.redisClientConnectionManager
			? customizations.redisClientConnectionManager
			: new RedisClientConnectionManager(
					undefined,
					redisConfig,
					redisConfig.enableClustering,
					redisConfig.slotsRefreshTimeout,
			  );

		const redisParams = {
			expireAfterSeconds: redisConfig.keyExpireAfterSeconds as number | undefined,
		};

		// const retryDelays = {
		// 	retryDelayOnFailover: 100,
		// 	retryDelayOnClusterDown: 100,
		// 	retryDelayOnTryAgain: 100,
		// 	retryDelayOnMoved: redisConfig.retryDelayOnMoved ?? 100,
		// 	maxRedirections: redisConfig.maxRedirections ?? 16,
		// };

		const disableGitCache = config.get("restGitService:disableGitCache") as boolean | undefined;
		const gitCache = disableGitCache
			? undefined
			: new historianServices.RedisCache(redisClientConnectionManager, redisParams);
		const tenantCache = new historianServices.RedisTenantCache(
			redisClientConnectionManager,
			redisParams,
		);
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
		const redisClientConnectionManagerForThrottling =
			customizations?.redisClientConnectionManagerForThrottling
				? customizations.redisClientConnectionManagerForThrottling
				: new RedisClientConnectionManager(
						undefined,
						redisConfigForThrottling,
						redisConfig.enableClustering,
						redisConfig.slotsRefreshTimeout,
				  );

		const redisParamsForThrottling = {
			expireAfterSeconds: redisConfigForThrottling.keyExpireAfterSeconds as
				| number
				| undefined,
		};

		const redisThrottleAndUsageStorageManager =
			new services.RedisThrottleAndUsageStorageManager(
				redisClientConnectionManagerForThrottling,
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
