/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import * as services from "@fluidframework/server-services";
import * as core from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import * as utils from "@fluidframework/server-services-utils";
import { Provider } from "nconf";
import * as Redis from "ioredis";
import * as winston from "winston";
import { IAlfredTenant } from "@fluidframework/server-services-client";
import { Constants } from "../utils";
import { AlfredRunner } from "./runner";
import {
	DeltaService,
	StorageNameAllocator,
	IDocumentDeleteService,
	DocumentDeleteService,
} from "./services";
import { IAlfredResourcesCustomizations } from ".";

/**
 * @internal
 */
export class AlfredResources implements core.IResources {
	public webServerFactory: core.IWebServerFactory;

	constructor(
		public config: Provider,
		public producer: core.IProducer,
		public redisConfig: any,
		public tenantManager: core.ITenantManager,
		public restTenantThrottlers: Map<string, core.IThrottler>,
		public restClusterThrottlers: Map<string, core.IThrottler>,
		public singleUseTokenCache: core.ICache,
		public storage: core.IDocumentStorage,
		public appTenants: IAlfredTenant[],
		public mongoManager: core.MongoManager,
		public deltaService: core.IDeltaService,
		public port: any,
		public documentsCollectionName: string,
		public documentRepository: core.IDocumentRepository,
		public documentDeleteService: IDocumentDeleteService,
		public tokenRevocationManager?: core.ITokenRevocationManager,
		public revokedTokenChecker?: core.IRevokedTokenChecker,
		public serviceMessageResourceManager?: core.IServiceMessageResourceManager,
		public clusterDrainingChecker?: core.IClusterDrainingChecker,
		public enableClientIPLogging?: boolean,
	) {
		const httpServerConfig: services.IHttpServerConfig = config.get("system:httpServer");
		const nodeClusterConfig: Partial<services.INodeClusterConfig> | undefined = config.get(
			"alfred:nodeClusterConfig",
		);
		const useNodeCluster = config.get("alfred:useNodeCluster");
		this.webServerFactory = useNodeCluster
			? new services.NodeClusterWebServerFactory(httpServerConfig, nodeClusterConfig)
			: new services.BasicWebServerFactory(httpServerConfig);
	}

	public async dispose(): Promise<void> {
		const producerClosedP = this.producer.close();
		const mongoClosedP = this.mongoManager.close();
		const tokenRevocationManagerP = this.tokenRevocationManager
			? this.tokenRevocationManager.close()
			: Promise.resolve();
		const serviceMessageManagerP = this.serviceMessageResourceManager
			? this.serviceMessageResourceManager.close()
			: Promise.resolve();
		await Promise.all([
			producerClosedP,
			mongoClosedP,
			tokenRevocationManagerP,
			serviceMessageManagerP,
		]);
	}
}

/**
 * @internal
 */
export class AlfredResourcesFactory implements core.IResourcesFactory<AlfredResources> {
	public async create(
		config: Provider,
		customizations?: IAlfredResourcesCustomizations,
	): Promise<AlfredResources> {
		// Producer used to publish messages
		const kafkaEndpoint = config.get("kafka:lib:endpoint");
		const kafkaLibrary = config.get("kafka:lib:name");
		const kafkaClientId = config.get("alfred:kafkaClientId");
		const topic = config.get("alfred:topic");
		const kafkaProducerPollIntervalMs = config.get("kafka:lib:producerPollIntervalMs");
		const kafkaNumberOfPartitions = config.get("kafka:lib:numberOfPartitions");
		const kafkaReplicationFactor = config.get("kafka:lib:replicationFactor");
		const kafkaMaxBatchSize = config.get("kafka:lib:maxBatchSize");
		const kafkaSslCACertFilePath: string = config.get("kafka:lib:sslCACertFilePath");
		const eventHubConnString: string = config.get("kafka:lib:eventHubConnString");

		const producer = services.createProducer(
			kafkaLibrary,
			kafkaEndpoint,
			kafkaClientId,
			topic,
			false,
			kafkaProducerPollIntervalMs,
			kafkaNumberOfPartitions,
			kafkaReplicationFactor,
			kafkaMaxBatchSize,
			kafkaSslCACertFilePath,
			eventHubConnString,
		);

		const redisConfig = config.get("redis");
		const authEndpoint = config.get("auth:endpoint");

		// Redis connection for client manager and single-use JWTs.
		const redisConfig2 = config.get("redis2");
		const redisOptions2: Redis.RedisOptions = {
			host: redisConfig2.host,
			port: redisConfig2.port,
			password: redisConfig2.pass,
			connectTimeout: redisConfig2.connectTimeout,
			enableReadyCheck: true,
			maxRetriesPerRequest: redisConfig2.maxRetriesPerRequest,
			enableOfflineQueue: redisConfig2.enableOfflineQueue,
			retryStrategy: utils.getRedisClusterRetryStrategy({
				delayPerAttemptMs: 50,
				maxDelayMs: 2000,
			}),
		};
		if (redisConfig2.enableAutoPipelining) {
			/**
			 * When enabled, all commands issued during an event loop iteration are automatically wrapped in a
			 * pipeline and sent to the server at the same time. This can improve performance by 30-50%.
			 * More info: https://github.com/luin/ioredis#autopipelining
			 */
			redisOptions2.enableAutoPipelining = true;
			redisOptions2.autoPipeliningIgnoredCommands = ["ping"];
		}
		if (redisConfig2.tls) {
			redisOptions2.tls = {
				servername: redisConfig2.host,
			};
		}

		const redisClientForJwtCache: Redis.default | Redis.Cluster = utils.getRedisClient(
			redisOptions2,
			redisConfig2.slotsRefreshTimeout,
			redisConfig2.enableClustering,
		);
		const redisJwtCache = new services.RedisCache(redisClientForJwtCache);

		// Database connection for global db if enabled
		let globalDbMongoManager;
		const globalDbEnabled = config.get("mongo:globalDbEnabled") as boolean;
		const factory = await services.getDbFactory(config);
		if (globalDbEnabled) {
			globalDbMongoManager = new core.MongoManager(factory, false, null, true);
		}

		// Database connection for operations db
		const operationsDbMongoManager = new core.MongoManager(factory);
		const documentsCollectionName = config.get("mongo:collectionNames:documents");
		const checkpointsCollectionName = config.get("mongo:collectionNames:checkpoints");

		// Create the index on the documents collection
		const dbManager = globalDbEnabled ? globalDbMongoManager : operationsDbMongoManager;
		const db: core.IDb = await dbManager.getDatabase();
		const documentsCollection = db.collection<core.IDocument>(documentsCollectionName);
		await documentsCollection.createIndex(
			{
				documentId: 1,
				tenantId: 1,
			},
			true,
		);
		const deltasCollectionName = config.get("mongo:collectionNames:deltas");
		const scribeCollectionName = config.get("mongo:collectionNames:scribeDeltas");

		// Setup for checkpoint collection

		const operationsDb = await operationsDbMongoManager.getDatabase();
		const checkpointsCollection =
			operationsDb.collection<core.ICheckpoint>(checkpointsCollectionName);
		await checkpointsCollection.createIndex(
			{
				documentId: 1,
			},
			true,
		);
		await checkpointsCollection.createIndex(
			{
				tenantId: 1,
			},
			false,
		);

		const defaultTTLInSeconds = 864000;
		const checkpointsTTLSeconds =
			config.get("checkpoints:checkpointsTTLInSeconds") ?? defaultTTLInSeconds;
		await checkpointsCollection.createTTLIndex({ _ts: 1 }, checkpointsTTLSeconds);

		const nodeCollectionName = config.get("mongo:collectionNames:nodes");

		// This.nodeTracker.on("invalidate", (id) => this.emit("invalidate", id));

		const internalHistorianUrl = config.get("worker:internalBlobStorageUrl");
		const tenantManager = new services.TenantManager(authEndpoint, internalHistorianUrl);

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
		const redisParamsForThrottling = {
			expireAfterSeconds: redisConfigForThrottling.keyExpireAfterSeconds as
				| number
				| undefined,
		};

		const redisClientForThrottling: Redis.default | Redis.Cluster = utils.getRedisClient(
			redisOptionsForThrottling,
			redisConfigForThrottling.slotsRefreshTimeout,
			redisConfigForThrottling.enableClustering,
		);

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

		// Per-tenant Rest API Throttlers
		const restApiTenantThrottleConfig = utils.getThrottleConfig(
			config.get("alfred:throttling:restCallsPerTenant:generalRestCall"),
		);
		const restTenantThrottler = configureThrottler(restApiTenantThrottleConfig);

		const restApiTenantCreateDocThrottleConfig = utils.getThrottleConfig(
			config.get("alfred:throttling:restCallsPerTenant:createDoc"),
		);
		const restTenantCreateDocThrottler = configureThrottler(
			restApiTenantCreateDocThrottleConfig,
		);

		const restApiTenantGetDeltasThrottleConfig = utils.getThrottleConfig(
			config.get("alfred:throttling:restCallsPerTenant:getDeltas"),
		);
		const restTenantGetDeltasThrottler = configureThrottler(
			restApiTenantGetDeltasThrottleConfig,
		);

		const restApiTenantGetSessionThrottleConfig = utils.getThrottleConfig(
			config.get("alfred:throttling:restCallsPerTenant:getSession"),
		);
		const restTenantGetSessionThrottler = configureThrottler(
			restApiTenantGetSessionThrottleConfig,
		);

		const restTenantThrottlers = new Map<string, core.IThrottler>();
		restTenantThrottlers.set(Constants.createDocThrottleIdPrefix, restTenantCreateDocThrottler);
		restTenantThrottlers.set(Constants.getDeltasThrottleIdPrefix, restTenantGetDeltasThrottler);
		restTenantThrottlers.set(
			Constants.getSessionThrottleIdPrefix,
			restTenantGetSessionThrottler,
		);
		restTenantThrottlers.set(Constants.generalRestCallThrottleIdPrefix, restTenantThrottler);

		// Per-cluster Rest API Throttlers
		const restApiCreateDocThrottleConfig = utils.getThrottleConfig(
			config.get("alfred:throttling:restCallsPerCluster:createDoc"),
		);
		const restCreateDocThrottler = configureThrottler(restApiCreateDocThrottleConfig);

		const restApiGetDeltasThrottleConfig = utils.getThrottleConfig(
			config.get("alfred:throttling:restCallsPerCluster:getDeltas"),
		);
		const restGetDeltasThrottler = configureThrottler(restApiGetDeltasThrottleConfig);

		const restApiGetSessionThrottleConfig = utils.getThrottleConfig(
			config.get("alfred:throttling:restCallsPerCluster:getSession"),
		);
		const restGetSessionThrottler = configureThrottler(restApiGetSessionThrottleConfig);

		const restClusterThrottlers = new Map<string, core.IThrottler>();
		restClusterThrottlers.set(Constants.createDocThrottleIdPrefix, restCreateDocThrottler);
		restClusterThrottlers.set(Constants.getDeltasThrottleIdPrefix, restGetDeltasThrottler);
		restClusterThrottlers.set(Constants.getSessionThrottleIdPrefix, restGetSessionThrottler);

		const documentRepository =
			customizations?.documentRepository ??
			new core.MongoDocumentRepository(documentsCollection);

		const databaseManager = new core.MongoDatabaseManager(
			globalDbEnabled,
			operationsDbMongoManager,
			globalDbMongoManager,
			nodeCollectionName,
			documentsCollectionName,
			checkpointsCollectionName,
			deltasCollectionName,
			scribeCollectionName,
		);

		const enableWholeSummaryUpload = config.get("storage:enableWholeSummaryUpload") as boolean;
		const opsCollection = await databaseManager.getDeltaCollection(undefined, undefined);
		const storagePerDocEnabled = (config.get("storage:perDocEnabled") as boolean) ?? false;
		const storageNameAllocator = storagePerDocEnabled
			? customizations?.storageNameAllocator ?? new StorageNameAllocator(tenantManager)
			: undefined;
		const storage = new services.DocumentStorage(
			documentRepository,
			tenantManager,
			enableWholeSummaryUpload,
			opsCollection,
			storageNameAllocator,
		);

		const enableClientIPLogging = config.get("alfred:enableClientIPLogging") ?? false;

		// Tenants attached to the apps this service exposes
		const appTenants = config.get("alfred:tenants") as { id: string; key: string }[];

		// This wanst to create stuff
		const port = utils.normalizePort(process.env.PORT || "3000");

		const deltaService = new DeltaService(opsCollection, tenantManager);
		const documentDeleteService =
			customizations?.documentDeleteService ?? new DocumentDeleteService();

		// Service Message setup
		const serviceMessageResourceManager = customizations?.serviceMessageResourceManager;

		// Set up token revocation if enabled
		/**
		 * Always have a revoked token checker,
		 * just make sure it rejects existing revoked tokens even with the feature flag disabled
		 */
		const revokedTokenChecker: core.IRevokedTokenChecker =
			customizations?.revokedTokenChecker ?? new utils.DummyRevokedTokenChecker();
		const tokenRevocationEnabled: boolean = utils.getBooleanFromConfig(
			"tokenRevocation:enable",
			config,
		);
		let tokenRevocationManager: core.ITokenRevocationManager | undefined;
		if (tokenRevocationEnabled) {
			tokenRevocationManager =
				customizations?.tokenRevocationManager ?? new utils.DummyTokenRevocationManager();
			await tokenRevocationManager.initialize().catch((error) => {
				// Do NOT crash the service if token revocation feature cannot be initialized properly.
				Lumberjack.error("Failed to initialize token revocation manager", undefined, error);
			});
		}

		return new AlfredResources(
			config,
			producer,
			redisConfig,
			tenantManager,
			restTenantThrottlers,
			restClusterThrottlers,
			redisJwtCache,
			storage,
			appTenants,
			operationsDbMongoManager,
			deltaService,
			port,
			documentsCollectionName,
			documentRepository,
			documentDeleteService,
			tokenRevocationManager,
			revokedTokenChecker,
			serviceMessageResourceManager,
			customizations?.clusterDrainingChecker,
			enableClientIPLogging,
		);
	}
}

/**
 * @internal
 */
export class AlfredRunnerFactory implements core.IRunnerFactory<AlfredResources> {
	public async create(resources: AlfredResources): Promise<core.IRunner> {
		return new AlfredRunner(
			resources.webServerFactory,
			resources.config,
			resources.port,
			resources.tenantManager,
			resources.restTenantThrottlers,
			resources.restClusterThrottlers,
			resources.singleUseTokenCache,
			resources.storage,
			resources.appTenants,
			resources.deltaService,
			resources.producer,
			resources.documentRepository,
			resources.documentDeleteService,
			resources.tokenRevocationManager,
			resources.revokedTokenChecker,
			null,
			resources.clusterDrainingChecker,
			resources.enableClientIPLogging,
		);
	}
}
