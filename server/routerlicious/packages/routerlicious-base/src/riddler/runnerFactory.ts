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
	ICollection,
	ICache,
} from "@fluidframework/server-services-core";
import * as utils from "@fluidframework/server-services-utils";
import { Provider } from "nconf";
import * as winston from "winston";
import * as Redis from "ioredis";
import { RiddlerRunner } from "./runner";
import { ITenantDocument } from "./tenantManager";

export class RiddlerResources implements IResources {
	public webServerFactory: IWebServerFactory;

	constructor(
		public readonly config: Provider,
		public readonly tenantsCollection: ICollection<ITenantDocument>,
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
		public readonly cache: ICache,
	) {
		const httpServerConfig: services.IHttpServerConfig = config.get("system:httpServer");
		this.webServerFactory = new services.BasicWebServerFactory(httpServerConfig);
	}

	public async dispose(): Promise<void> {
		await this.mongoManager.close();
	}
}

export class RiddlerResourcesFactory implements IResourcesFactory<RiddlerResources> {
	public async create(config: Provider): Promise<RiddlerResources> {
		// Cache connection
		const redisConfig = config.get("redisForTenantCache");
		let cache: ICache;
		if (redisConfig) {
			const redisOptions: Redis.RedisOptions = {
				host: redisConfig.host,
				port: redisConfig.port,
				password: redisConfig.pass,
				connectTimeout: redisConfig.connectTimeout,
				enableReadyCheck: true,
				maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
				enableOfflineQueue: redisConfig.enableOfflineQueue,
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
				prefix: "page",
			};
			const redisClient = new Redis.default(redisOptions);

			cache = new services.RedisCache(redisClient, redisParams);
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
			collection,
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

export class RiddlerRunnerFactory implements IRunnerFactory<RiddlerResources> {
	public async create(resources: RiddlerResources): Promise<IRunner> {
		return new RiddlerRunner(
			resources.webServerFactory,
			resources.tenantsCollection,
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
