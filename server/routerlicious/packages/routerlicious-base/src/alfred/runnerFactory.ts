/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as os from "os";
import cluster from "cluster";
import { TypedEventEmitter } from "@fluidframework/common-utils";
import { ICollaborationSessionEvents } from "@fluidframework/server-lambdas";
import { KafkaOrdererFactory } from "@fluidframework/server-kafka-orderer";
import {
	LocalNodeFactory,
	LocalOrderManager,
	NodeManager,
	ReservationManager,
} from "@fluidframework/server-memory-orderer";
import * as services from "@fluidframework/server-services";
import * as core from "@fluidframework/server-services-core";
import { getLumberBaseProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import * as utils from "@fluidframework/server-services-utils";
import * as bytes from "bytes";
import { Provider } from "nconf";
import * as Redis from "ioredis";
import * as winston from "winston";
import * as ws from "ws";
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

class NodeWebSocketServer implements core.IWebSocketServer {
	private readonly webSocketServer: ws.Server;

	constructor(portNumber: number) {
		this.webSocketServer = new ws.Server({ port: portNumber });
	}
	public on(event: string, listener: (...args: any[]) => void) {
		this.webSocketServer.on(event, listener);
	}
	// eslint-disable-next-line @typescript-eslint/promise-function-async
	public close(): Promise<void> {
		this.webSocketServer.close();
		return Promise.resolve();
	}
}

/**
 * @internal
 */
export class OrdererManager implements core.IOrdererManager {
	constructor(
		private readonly globalDbEnabled: boolean,
		private readonly ordererUrl: string,
		private readonly tenantManager: core.ITenantManager,
		private readonly localOrderManager: LocalOrderManager,
		private readonly kafkaFactory: KafkaOrdererFactory,
	) {}

	public async getOrderer(tenantId: string, documentId: string): Promise<core.IOrderer> {
		const tenant = await this.tenantManager.getTenant(tenantId, documentId);

		const messageMetaData = { documentId, tenantId };
		winston.info(`tenant orderer: ${JSON.stringify(tenant.orderer)}`, { messageMetaData });
		Lumberjack.info(
			`tenant orderer: ${JSON.stringify(tenant.orderer)}`,
			getLumberBaseProperties(documentId, tenantId),
		);

		if (tenant.orderer.url !== this.ordererUrl && !this.globalDbEnabled) {
			Lumberjack.error(`Invalid ordering service endpoint`, { messageMetaData });
			throw new Error("Invalid ordering service endpoint");
		}

		switch (tenant.orderer.type) {
			case "kafka":
				return this.kafkaFactory.create(tenantId, documentId);
			default:
				return this.localOrderManager.get(tenantId, documentId);
		}
	}
}

/**
 * @internal
 */
export class AlfredResources implements core.IResources {
	public webServerFactory: core.IWebServerFactory;

	constructor(
		public config: Provider,
		public producer: core.IProducer,
		public redisConfig: any,
		public clientManager: core.IClientManager,
		public webSocketLibrary: string,
		public orderManager: core.IOrdererManager,
		public tenantManager: core.ITenantManager,
		public restTenantThrottlers: Map<string, core.IThrottler>,
		public restClusterThrottlers: Map<string, core.IThrottler>,
		public socketConnectTenantThrottler: core.IThrottler,
		public socketConnectClusterThrottler: core.IThrottler,
		public socketSubmitOpThrottler: core.IThrottler,
		public socketSubmitSignalThrottler: core.IThrottler,
		public singleUseTokenCache: core.ICache,
		public storage: core.IDocumentStorage,
		public appTenants: IAlfredTenant[],
		public mongoManager: core.MongoManager,
		public deltaService: core.IDeltaService,
		public port: any,
		public documentsCollectionName: string,
		public metricClientConfig: any,
		public documentRepository: core.IDocumentRepository,
		public documentDeleteService: IDocumentDeleteService,
		public throttleAndUsageStorageManager?: core.IThrottleAndUsageStorageManager,
		public verifyMaxMessageSize?: boolean,
		public redisCache?: core.ICache,
		public socketTracker?: core.IWebSocketTracker,
		public tokenRevocationManager?: core.ITokenRevocationManager,
		public revokedTokenChecker?: core.IRevokedTokenChecker,
		public collaborationSessionEvents?: TypedEventEmitter<ICollaborationSessionEvents>,
		public serviceMessageResourceManager?: core.IServiceMessageResourceManager,
		public clusterDrainingChecker?: core.IClusterDrainingChecker,
		public enableClientIPLogging?: boolean,
	) {
		const socketIoAdapterConfig = config.get("alfred:socketIoAdapter");
		const httpServerConfig: services.IHttpServerConfig = config.get("system:httpServer");
		const socketIoConfig = config.get("alfred:socketIo");
		const nodeClusterConfig: Partial<services.INodeClusterConfig> | undefined = config.get(
			"alfred:nodeClusterConfig",
		);
		const useNodeCluster = config.get("alfred:useNodeCluster");
		this.webServerFactory = useNodeCluster
			? new services.SocketIoNodeClusterWebServerFactory(
					redisConfig,
					socketIoAdapterConfig,
					httpServerConfig,
					socketIoConfig,
					nodeClusterConfig,
			  )
			: new services.SocketIoWebServerFactory(
					this.redisConfig,
					socketIoAdapterConfig,
					httpServerConfig,
					socketIoConfig,
			  );
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
		const metricClientConfig = config.get("metric");
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
		const webSocketLibrary = config.get("alfred:webSocketLib");
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
<<<<<<< HEAD
			retryStrategy(times) {
				const delay = Math.min(times * 50, 2000);
				return delay;
			},
=======
			retryStrategy: utils.getRedisClusterRetryStrategy({
				delayPerAttemptMs: 50,
				maxDelayMs: 2000,
			}),
>>>>>>> 462edccc8e09b87ac2356a2e080727c17b96bed2
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

		const redisParams2 = {
			expireAfterSeconds: redisConfig2.keyExpireAfterSeconds as number | undefined,
		};

<<<<<<< HEAD
		const redisClient: Redis.default | Redis.Cluster = redisConfig2.enableClustering
			? new Redis.Cluster([{ port: redisConfig2.port, host: redisConfig2.host }], {
					redisOptions: redisOptions2,
					slotsRefreshTimeout: 50000,
					dnsLookup: (adr, callback) => callback(null, adr),
					showFriendlyErrorStack: true,
			  })
			: new Redis.default(redisOptions2);
		const clientManager = new services.ClientManager(redisClient, redisParams2);

		const redisClientForJwtCache: Redis.default | Redis.Cluster = redisConfig2.enableClustering
			? new Redis.Cluster([{ port: redisConfig2.port, host: redisConfig2.host }], {
					redisOptions: redisOptions2,
					slotsRefreshTimeout: 50000,
					dnsLookup: (adr, callback) => callback(null, adr),
					showFriendlyErrorStack: true,
			  })
			: new Redis.default(redisOptions2);
=======
		const redisClient: Redis.default | Redis.Cluster = utils.getRedisClient(
			redisOptions2,
			redisConfig2.slotsRefreshTimeout,
			redisConfig2.enableClustering,
		);
		const clientManager = new services.ClientManager(redisClient, redisParams2);

		const redisClientForJwtCache: Redis.default | Redis.Cluster = utils.getRedisClient(
			redisOptions2,
			redisConfig2.slotsRefreshTimeout,
			redisConfig2.enableClustering,
		);
>>>>>>> 462edccc8e09b87ac2356a2e080727c17b96bed2
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
		const localCheckpointEnabled = config.get("checkpoints:localCheckpointEnabled");
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
		const nodeManager = new NodeManager(operationsDbMongoManager, nodeCollectionName);
		// This.nodeTracker.on("invalidate", (id) => this.emit("invalidate", id));
		const reservationManager = new ReservationManager(
			nodeManager,
			operationsDbMongoManager,
			config.get("mongo:collectionNames:reservations"),
		);

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
<<<<<<< HEAD
			retryStrategy(times) {
				const delay = Math.min(times * 50, 2000);
				return delay;
			},
=======
			retryStrategy: utils.getRedisClusterRetryStrategy({
				delayPerAttemptMs: 50,
				maxDelayMs: 2000,
			}),
>>>>>>> 462edccc8e09b87ac2356a2e080727c17b96bed2
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

<<<<<<< HEAD
		const redisClientForThrottling: Redis.default | Redis.Cluster =
			redisConfigForThrottling.enableClustering
				? new Redis.Cluster(
						[
							{
								port: redisConfigForThrottling.port,
								host: redisConfigForThrottling.host,
							},
						],
						{
							redisOptions: redisOptionsForThrottling,
							slotsRefreshTimeout: 50000,
							dnsLookup: (adr, callback) => callback(null, adr),
							showFriendlyErrorStack: true,
						},
				  )
				: new Redis.default(redisOptionsForThrottling);
=======
		const redisClientForThrottling: Redis.default | Redis.Cluster = utils.getRedisClient(
			redisOptionsForThrottling,
			redisConfigForThrottling.slotsRefreshTimeout,
			redisConfigForThrottling.enableClustering,
		);
>>>>>>> 462edccc8e09b87ac2356a2e080727c17b96bed2

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

		// Socket Connection Throttler
		const socketConnectionThrottleConfigPerTenant = utils.getThrottleConfig(
			config.get("alfred:throttling:socketConnectionsPerTenant"),
		);
		const socketConnectTenantThrottler = configureThrottler(
			socketConnectionThrottleConfigPerTenant,
		);

		const socketConnectionThrottleConfigPerCluster = utils.getThrottleConfig(
			config.get("alfred:throttling:socketConnectionsPerCluster"),
		);
		const socketConnectClusterThrottler = configureThrottler(
			socketConnectionThrottleConfigPerCluster,
		);

		// Socket SubmitOp Throttler
		const submitOpThrottleConfig = utils.getThrottleConfig(
			config.get("alfred:throttling:submitOps"),
		);
		const socketSubmitOpThrottler = configureThrottler(submitOpThrottleConfig);

		// Socket SubmitSignal Throttler
		const submitSignalThrottleConfig = utils.getThrottleConfig(
			config.get("alfred:throttling:submitSignals"),
		);
		const socketSubmitSignalThrottler = configureThrottler(submitSignalThrottleConfig);
		const documentRepository =
			customizations?.documentRepository ??
			new core.MongoDocumentRepository(documentsCollection);
		const deliCheckpointRepository = new core.MongoCheckpointRepository(
			checkpointsCollection,
			"deli",
		);
		const scribeCheckpointRepository = new core.MongoCheckpointRepository(
			checkpointsCollection,
			"scribe",
		);

		const deliCheckpointService = new core.CheckpointService(
			deliCheckpointRepository,
			documentRepository,
			localCheckpointEnabled,
		);
		const scribeCheckpointService = new core.CheckpointService(
			scribeCheckpointRepository,
			documentRepository,
			localCheckpointEnabled,
		);

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

		const maxSendMessageSize = bytes.parse(config.get("alfred:maxMessageSize"));
		// Disable by default because microsoft/FluidFramework/pull/#9223 set chunking to disabled by default.
		// Therefore, default clients will ignore server's 16kb message size limit.
		const verifyMaxMessageSize = config.get("alfred:verifyMaxMessageSize") ?? false;

		const enableClientIPLogging = config.get("alfred:enableClientIPLogging") ?? false;

		// This cache will be used to store connection counts for logging connectionCount metrics.
		let redisCache: core.ICache;
		if (config.get("alfred:enableConnectionCountLogging")) {
			const redisOptions: Redis.RedisOptions = {
				host: redisConfig.host,
				port: redisConfig.port,
				password: redisConfig.pass,
				connectTimeout: redisConfig.connectTimeout,
				enableReadyCheck: true,
				maxRetriesPerRequest: redisConfig.maxRetriesPerRequest,
				enableOfflineQueue: redisConfig.enableOfflineQueue,
<<<<<<< HEAD
				retryStrategy(times) {
					const delay = Math.min(times * 50, 2000);
					return delay;
				},
=======
				retryStrategy: utils.getRedisClusterRetryStrategy({
					delayPerAttemptMs: 50,
					maxDelayMs: 2000,
				}),
>>>>>>> 462edccc8e09b87ac2356a2e080727c17b96bed2
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

<<<<<<< HEAD
			const redisClientForLogging: Redis.default | Redis.Cluster =
				redisConfig.enableClustering
					? new Redis.Cluster([{ port: redisConfig.port, host: redisConfig.host }], {
							redisOptions,
							slotsRefreshTimeout: 50000,
							dnsLookup: (adr, callback) => callback(null, adr),
							showFriendlyErrorStack: true,
					  })
					: new Redis.default(redisOptions);

=======
			const redisClientForLogging: Redis.default | Redis.Cluster = utils.getRedisClient(
				redisOptions,
				redisConfig.slotsRefreshTimeout,
				redisConfig.enableClustering,
			);
>>>>>>> 462edccc8e09b87ac2356a2e080727c17b96bed2
			redisCache = new services.RedisCache(redisClientForLogging);
		}

		const address = `${await utils.getHostIp()}:4000`;
		const nodeFactory = new LocalNodeFactory(
			os.hostname(),
			address,
			storage,
			databaseManager,
			documentRepository,
			deliCheckpointRepository,
			scribeCheckpointRepository,
			deliCheckpointService,
			scribeCheckpointService,
			60000,
			() => new NodeWebSocketServer(cluster.isPrimary ? 4000 : 0),
			maxSendMessageSize,
			winston,
		);

		const localOrderManager = new LocalOrderManager(nodeFactory, reservationManager);
		const kafkaOrdererFactory = new KafkaOrdererFactory(
			producer,
			maxSendMessageSize,
			core.DefaultServiceConfiguration,
		);
		const serverUrl = config.get("worker:serverUrl");

		const orderManager = new OrdererManager(
			globalDbEnabled,
			serverUrl,
			tenantManager,
			localOrderManager,
			kafkaOrdererFactory,
		);

		const collaborationSessionEvents = new TypedEventEmitter<ICollaborationSessionEvents>();

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
		let socketTracker: core.IWebSocketTracker | undefined;
		let tokenRevocationManager: core.ITokenRevocationManager | undefined;
		if (tokenRevocationEnabled) {
			socketTracker = customizations?.webSocketTracker ?? new utils.WebSocketTracker();
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
			clientManager,
			webSocketLibrary,
			orderManager,
			tenantManager,
			restTenantThrottlers,
			restClusterThrottlers,
			socketConnectTenantThrottler,
			socketConnectClusterThrottler,
			socketSubmitOpThrottler,
			socketSubmitSignalThrottler,
			redisJwtCache,
			storage,
			appTenants,
			operationsDbMongoManager,
			deltaService,
			port,
			documentsCollectionName,
			metricClientConfig,
			documentRepository,
			documentDeleteService,
			redisThrottleAndUsageStorageManager,
			verifyMaxMessageSize,
			redisCache,
			socketTracker,
			tokenRevocationManager,
			revokedTokenChecker,
			collaborationSessionEvents,
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
			resources.orderManager,
			resources.tenantManager,
			resources.restTenantThrottlers,
			resources.restClusterThrottlers,
			resources.socketConnectTenantThrottler,
			resources.socketConnectClusterThrottler,
			resources.socketSubmitOpThrottler,
			resources.socketSubmitSignalThrottler,
			resources.singleUseTokenCache,
			resources.storage,
			resources.clientManager,
			resources.appTenants,
			resources.deltaService,
			resources.producer,
			resources.metricClientConfig,
			resources.documentRepository,
			resources.documentDeleteService,
			resources.throttleAndUsageStorageManager,
			resources.verifyMaxMessageSize,
			resources.redisCache,
			resources.socketTracker,
			resources.tokenRevocationManager,
			resources.revokedTokenChecker,
			resources.collaborationSessionEvents,
			resources.clusterDrainingChecker,
			resources.enableClientIPLogging,
		);
	}
}
