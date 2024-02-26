/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as services from "@fluidframework/server-services";
import { getOrCreateRepository } from "@fluidframework/server-services-client";
import { BaseTelemetryProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import {
	MongoManager,
	IDb,
	ISecretManager,
	IResources,
	IResourcesFactory,
	IRunner,
	IRunnerFactory,
	IWebServerFactory,
} from "@fluidframework/server-services-core";
import * as utils from "@fluidframework/server-services-utils";
import { Provider } from "nconf";
import * as winston from "winston";
import { RedisCache } from "@fluidframework/server-services";
import { RedisClientConnectionManager } from "@fluidframework/server-services-shared";
import { RiddlerRunner } from "./runner";
import { ITenantDocument } from "./tenantManager";
import { IRiddlerResourcesCustomizations } from "./customizations";
import { ITenantRepository, MongoTenantRepository } from "./mongoTenantRepository";

/**
 * @internal
 */
export class RiddlerResources implements IResources {
	public webServerFactory: IWebServerFactory;

	constructor(
		public readonly config: Provider,
		public readonly tenantRepository: ITenantRepository,
		public readonly tenantsCollectionName: string,
		public readonly mongoManager: MongoManager,
		public readonly port: any,
		public readonly loggerFormat: string,
		public readonly baseOrdererUrl: string,
		public readonly defaultHistorianUrl: string,
		public readonly defaultInternalHistorianUrl: string,
		public readonly secretManager: ISecretManager,
		public readonly fetchTenantKeyMetricIntervalMs: number,
		public readonly riddlerStorageRequestMetricIntervalMs: number,
		public readonly cache: RedisCache,
	) {
		const httpServerConfig: services.IHttpServerConfig = config.get("system:httpServer");
		const nodeClusterConfig: Partial<services.INodeClusterConfig> | undefined = config.get(
			"riddler:nodeClusterConfig",
		);
		const useNodeCluster = config.get("riddler:useNodeCluster");
		this.webServerFactory = useNodeCluster
			? new services.NodeClusterWebServerFactory(httpServerConfig, nodeClusterConfig)
			: new services.BasicWebServerFactory(httpServerConfig);
	}

	public async dispose(): Promise<void> {
		await this.mongoManager.close();
	}
}

/**
 * @internal
 */
export class RiddlerResourcesFactory implements IResourcesFactory<RiddlerResources> {
	public async create(
		config: Provider,
		customizations?: IRiddlerResourcesCustomizations,
	): Promise<RiddlerResources> {
		// Cache connection
		const redisConfig = config.get("redisForTenantCache");
		let cache: RedisCache;
		if (redisConfig) {
			const redisParams = {
				expireAfterSeconds: redisConfig.keyExpireAfterSeconds as number | undefined,
			};

			const redisClientConnectionManagerForTenantCache =
				customizations?.redisClientConnectionManagerForTenantCache
					? customizations.redisClientConnectionManagerForTenantCache
					: new RedisClientConnectionManager(
							undefined,
							redisConfig,
							redisConfig.enableClustering,
							redisConfig.slotsRefreshTimeout,
					  );
			cache = new RedisCache(redisClientConnectionManagerForTenantCache, redisParams);
		}
		// Database connection
		const factory = await services.getDbFactory(config);

		const operationsDbMongoManager = new MongoManager(factory);
		const tenantsCollectionName = config.get("mongo:collectionNames:tenants");
		const secretManager = new services.SecretManager();

		// Load configs for default tenants
		let globalDbMongoManager;
		const globalDbEnabled = config.get("mongo:globalDbEnabled") as boolean;
		if (globalDbEnabled) {
			const globalDbReconnect = (config.get("mongo:globalDbReconnect") as boolean) ?? false;
			globalDbMongoManager = new MongoManager(factory, globalDbReconnect, null, true);
		}

		const mongoManager = globalDbEnabled ? globalDbMongoManager : operationsDbMongoManager;
		const db: IDb = await mongoManager.getDatabase();

		const collection = db.collection<ITenantDocument>(tenantsCollectionName);
		const tenantRepository =
			customizations?.tenantRepository ?? new MongoTenantRepository(collection);
		const tenants = config.get("tenantConfig") as any[];
		const upsertP = tenants.map(async (tenant) => {
			tenant.key = secretManager.encryptSecret(tenant.key);
			await collection.upsert({ _id: tenant._id }, tenant, null);

			// Skip creating anything with credentials - we assume this is external to us and something we can't
			// or don't want to automatically create (i.e. GitHub)
			if (!tenant.storage.credentials) {
				try {
					const storageUrl = config.get("storage:storageUrl");
					await getOrCreateRepository(
						storageUrl,
						tenant.storage.owner,
						tenant.storage.repository,
					);
				} catch (err) {
					// This is okay to fail since the repos are alreay created in production.
					winston.error(`Error creating repos`);
					Lumberjack.error(
						`Error creating repos`,
						{ [BaseTelemetryProperties.tenantId]: tenant._id },
						err,
					);
				}
			}
		});
		await Promise.all(upsertP);

		const loggerFormat = config.get("logger:morganFormat");
		const port = utils.normalizePort(process.env.PORT || "5000");
		const serverUrl = config.get("worker:serverUrl");
		const defaultHistorianUrl = config.get("worker:blobStorageUrl");
		const defaultInternalHistorianUrl =
			config.get("worker:internalBlobStorageUrl") || defaultHistorianUrl;

		const fetchTenantKeyMetricIntervalMs = config.get("apiCounters:fetchTenantKeyMetricMs");
		const riddlerStorageRequestMetricIntervalMs = config.get(
			"apiCounters:riddlerStorageRequestMetricMs",
		);

		return new RiddlerResources(
			config,
			tenantRepository,
			tenantsCollectionName,
			mongoManager,
			port,
			loggerFormat,
			serverUrl,
			defaultHistorianUrl,
			defaultInternalHistorianUrl,
			secretManager,
			fetchTenantKeyMetricIntervalMs,
			riddlerStorageRequestMetricIntervalMs,
			cache,
		);
	}
}

/**
 * @internal
 */
export class RiddlerRunnerFactory implements IRunnerFactory<RiddlerResources> {
	public async create(resources: RiddlerResources): Promise<IRunner> {
		return new RiddlerRunner(
			resources.webServerFactory,
			resources.tenantRepository,
			resources.port,
			resources.loggerFormat,
			resources.baseOrdererUrl,
			resources.defaultHistorianUrl,
			resources.defaultInternalHistorianUrl,
			resources.secretManager,
			resources.fetchTenantKeyMetricIntervalMs,
			resources.riddlerStorageRequestMetricIntervalMs,
			resources.cache,
			resources.config,
		);
	}
}
