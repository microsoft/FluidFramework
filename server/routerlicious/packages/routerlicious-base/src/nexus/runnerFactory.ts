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
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import * as utils from "@fluidframework/server-services-utils";
import * as bytes from "bytes";
import { Provider } from "nconf";
import * as winston from "winston";
import * as ws from "ws";
import { RedisClientConnectionManager } from "@fluidframework/server-services-utils";
import { NexusRunner } from "./runner";
import { StorageNameAllocator } from "./services";
import { INexusResourcesCustomizations } from "./customizations";
import { OrdererManager, type IOrdererManagerOptions } from "./ordererManager";
import { IReadinessCheck } from "@fluidframework/server-services-core";
import { closeRedisClientConnections, StartupCheck } from "@fluidframework/server-services-shared";

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
export class NexusResources implements core.IResources {
	constructor(
		public config: Provider,
		public webServerFactory: core.IWebServerFactory,
		public clientManager: core.IClientManager,
		public webSocketLibrary: string,
		public orderManager: core.IOrdererManager,
		public tenantManager: core.ITenantManager,
		public socketConnectTenantThrottler: core.IThrottler,
		public socketConnectClusterThrottler: core.IThrottler,
		public socketSubmitOpThrottler: core.IThrottler,
		public socketSubmitSignalThrottler: core.IThrottler,
		public singleUseTokenCache: core.ICache,
		public storage: core.IDocumentStorage,
		public mongoManager: core.MongoManager,
		public port: any,
		public documentsCollectionName: string,
		public metricClientConfig: any,
		public startupCheck: IReadinessCheck,
		public redisClientConnectionManagers: utils.IRedisClientConnectionManager[],
		public throttleAndUsageStorageManager?: core.IThrottleAndUsageStorageManager,
		public verifyMaxMessageSize?: boolean,
		public redisCache?: core.ICache,
		public socketTracker?: core.IWebSocketTracker,
		public tokenRevocationManager?: core.ITokenRevocationManager,
		public revokedTokenChecker?: core.IRevokedTokenChecker,
		public collaborationSessionEvents?: TypedEventEmitter<ICollaborationSessionEvents>,
		public serviceMessageResourceManager?: core.IServiceMessageResourceManager,
		public clusterDrainingChecker?: core.IClusterDrainingChecker,
		public collaborationSessionTracker?: core.ICollaborationSessionTracker,
		public readinessCheck?: IReadinessCheck,
	) {}

	public async dispose(): Promise<void> {
		const mongoClosedP = this.mongoManager.close();
		const tokenRevocationManagerP = this.tokenRevocationManager
			? this.tokenRevocationManager.close()
			: Promise.resolve();
		const serviceMessageManagerP = this.serviceMessageResourceManager
			? this.serviceMessageResourceManager.close()
			: Promise.resolve();
		const redisClientConnectionManagersP = closeRedisClientConnections(
			this.redisClientConnectionManagers,
		);
		await Promise.all([
			mongoClosedP,
			tokenRevocationManagerP,
			serviceMessageManagerP,
			redisClientConnectionManagersP,
		]);
	}
}

/**
 * @internal
 */
export class NexusResourcesFactory implements core.IResourcesFactory<NexusResources> {
	public async create(
		config: Provider,
		customizations?: INexusResourcesCustomizations,
	): Promise<NexusResources> {
		const metricClientConfig = config.get("metric");
		// Producer used to publish messages
		const kafkaEndpoint = config.get("kafka:lib:endpoint");
		const kafkaLibrary = config.get("kafka:lib:name");
		const kafkaClientId = config.get("nexus:kafkaClientId");
		const topic = config.get("nexus:topic");
		const kafkaProducerPollIntervalMs = config.get("kafka:lib:producerPollIntervalMs");
		const kafkaNumberOfPartitions = config.get("kafka:lib:numberOfPartitions");
		const kafkaReplicationFactor = config.get("kafka:lib:replicationFactor");
		const kafkaMaxBatchSize = config.get("kafka:lib:maxBatchSize");
		const kafkaSslCACertFilePath: string = config.get("kafka:lib:sslCACertFilePath");
		const kafkaProducerGlobalAdditionalConfig = config.get(
			"kafka:lib:producerGlobalAdditionalConfig",
		);
		const eventHubConnString: string = config.get("kafka:lib:eventHubConnString");
		const oauthBearerConfig = config.get("kafka:lib:oauthBearerConfig");
		// List of Redis client connection managers that need to be closed on dispose
		const redisClientConnectionManagers: utils.IRedisClientConnectionManager[] = [];

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
			kafkaProducerGlobalAdditionalConfig,
			oauthBearerConfig,
		);

		const redisConfig = config.get("redis");

		// Redis connection for client manager and single-use JWTs.
		const redisConfig2 = config.get("redis2");

		const redisParams2 = {
			expireAfterSeconds: redisConfig2.keyExpireAfterSeconds as number | undefined,
		};

		const retryDelays = {
			retryDelayOnFailover: 100,
			retryDelayOnClusterDown: 100,
			retryDelayOnTryAgain: 100,
			retryDelayOnMoved: redisConfig2.retryDelayOnMoved ?? 100,
			maxRedirections: redisConfig2.maxRedirections ?? 16,
		};

		const redisClientConnectionManager = customizations?.redisClientConnectionManager
			? customizations.redisClientConnectionManager
			: new RedisClientConnectionManager(
					undefined,
					redisConfig2,
					redisConfig2.enableClustering,
					redisConfig2.slotsRefreshTimeout,
					retryDelays,
			  );
		redisClientConnectionManagers.push(redisClientConnectionManager);

		const clientManager = new services.ClientManager(
			redisClientConnectionManager,
			redisParams2,
		);

		/**
		 * Whether to enable collaboration session tracking.
		 */
		const enableCollaborationSessionTracking: boolean | undefined = config.get(
			"nexus:enableCollaborationSessionTracking",
		);
		/**
		 * Whether to enable pruning of collaboration session tracking information on an interval.
		 */
		const enableCollaborationSessionPruning: boolean | undefined = config.get(
			"nexus:enableCollaborationSessionPruning",
		);
		const redisCollaborationSessionManagerOptions: Partial<services.IRedisCollaborationSessionManagerOptions> =
			config.get("nexus:redisCollaborationSessionManagerOptions") ?? {};
		const collaborationSessionManager =
			enableCollaborationSessionTracking === true
				? new services.RedisCollaborationSessionManager(
						redisClientConnectionManager,
						redisParams2,
						redisCollaborationSessionManagerOptions,
				  )
				: undefined;
		const collaborationSessionTracker =
			enableCollaborationSessionTracking === true && collaborationSessionManager !== undefined
				? new services.CollaborationSessionTracker(
						clientManager,
						collaborationSessionManager,
						// Same as Deli close on inactivity, which signals session end.
						core.DefaultServiceConfiguration.documentLambda.partitionActivityTimeout,
				  )
				: undefined;
		if (
			enableCollaborationSessionPruning === true &&
			collaborationSessionTracker !== undefined
		) {
			const intervalMs =
				core.DefaultServiceConfiguration.documentLambda.partitionActivityCheckInterval;
			setInterval(() => {
				collaborationSessionTracker.pruneInactiveSessions().catch((error) => {
					Lumberjack.error(
						"Failed to prune inactive sessions on an interval",
						{ intervalMs },
						error,
					);
				});
			}, intervalMs);
		}

		const redisClientConnectionManagerForJwtCache =
			customizations?.redisClientConnectionManagerForJwtCache
				? customizations.redisClientConnectionManagerForJwtCache
				: new RedisClientConnectionManager(
						undefined,
						redisConfig2,
						redisConfig2.enableClustering,
						redisConfig2.slotsRefreshTimeout,
				  );
		redisClientConnectionManagers.push(redisClientConnectionManagerForJwtCache);
		const redisJwtCache = new services.RedisCache(redisClientConnectionManagerForJwtCache);

		// Database connection for global db if enabled
		let globalDbMongoManager;
		const globalDbEnabled = config.get("mongo:globalDbEnabled") as boolean;
		const factory = await services.getDbFactory(config);
		if (globalDbEnabled) {
			globalDbMongoManager = new core.MongoManager(
				factory,
				false,
				undefined /* retryDelayMs */,
				true /* global */,
			);
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
		if (checkpointsCollection.createTTLIndex !== undefined) {
			await checkpointsCollection.createTTLIndex({ _ts: 1 }, checkpointsTTLSeconds);
		}

		const nodeCollectionName = config.get("mongo:collectionNames:nodes");
		const nodeManager = new NodeManager(operationsDbMongoManager, nodeCollectionName);
		// This.nodeTracker.on("invalidate", (id) => this.emit("invalidate", id));
		const reservationManager = new ReservationManager(
			nodeManager,
			operationsDbMongoManager,
			config.get("mongo:collectionNames:reservations"),
		);

		const internalHistorianUrl = config.get("worker:internalBlobStorageUrl");
		const authEndpoint = config.get("auth:endpoint");
		const historianApiVersion: string = config.get("storage:historianApiVersion") ?? "1.0";
		const tenantManager = new services.TenantManager(authEndpoint, internalHistorianUrl, {
			historianApiVersion,
		});

		// Redis connection for throttling.
		const redisConfigForThrottling = config.get("redisForThrottling");
		const redisParamsForThrottling = {
			expireAfterSeconds: redisConfigForThrottling.keyExpireAfterSeconds as
				| number
				| undefined,
		};

		const redisClientConnectionManagerForThrottling =
			customizations?.redisClientConnectionManagerForThrottling
				? customizations.redisClientConnectionManagerForThrottling
				: new RedisClientConnectionManager(
						undefined,
						redisConfigForThrottling,
						redisConfigForThrottling.enableClustering,
						redisConfigForThrottling.slotsRefreshTimeout,
						retryDelays,
				  );
		redisClientConnectionManagers.push(redisClientConnectionManagerForThrottling);

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

		// Socket Connection Throttler
		const socketConnectionThrottleConfigPerTenant = utils.getThrottleConfig(
			config.get("nexus:throttling:socketConnectionsPerTenant"),
		);
		const socketConnectTenantThrottler = configureThrottler(
			socketConnectionThrottleConfigPerTenant,
		);

		const socketConnectionThrottleConfigPerCluster = utils.getThrottleConfig(
			config.get("nexus:throttling:socketConnectionsPerCluster"),
		);
		const socketConnectClusterThrottler = configureThrottler(
			socketConnectionThrottleConfigPerCluster,
		);

		// Socket SubmitOp Throttler
		const submitOpThrottleConfig = utils.getThrottleConfig(
			config.get("nexus:throttling:submitOps"),
		);
		const socketSubmitOpThrottler = configureThrottler(submitOpThrottleConfig);

		// Socket SubmitSignal Throttler
		const submitSignalThrottleConfig = utils.getThrottleConfig(
			config.get("nexus:throttling:submitSignals"),
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
		const ephemeralDocumentTTLSec = config.get("storage:ephemeralDocumentTTLSec") as
			| number
			| undefined;
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
			ephemeralDocumentTTLSec,
		);

		const maxSendMessageSize = bytes.parse(config.get("nexus:maxMessageSize"));
		// Disable by default because microsoft/FluidFramework/pull/#9223 set chunking to disabled by default.
		// Therefore, default clients will ignore server's 16kb message size limit.
		const verifyMaxMessageSize = config.get("nexus:verifyMaxMessageSize") ?? false;

		// This cache will be used to store connection counts for logging connectionCount metrics.
		let redisCache: core.ICache | undefined;
		if (config.get("nexus:enableConnectionCountLogging")) {
			const redisClientConnectionManagerForLogging =
				customizations?.redisClientConnectionManagerForLogging
					? customizations.redisClientConnectionManagerForLogging
					: new RedisClientConnectionManager(
							undefined,
							redisConfig,
							redisConfig.enableClustering,
							redisConfig.slotsRefreshTimeout,
					  );
			redisClientConnectionManagers.push(redisClientConnectionManagerForLogging);

			redisCache = new services.RedisCache(redisClientConnectionManagerForLogging);
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

		const ordererManagerOptions: Partial<IOrdererManagerOptions> | undefined = config.get(
			"nexus:ordererManagerOptions",
		);
		const orderManager = new OrdererManager(
			globalDbEnabled,
			serverUrl,
			tenantManager,
			localOrderManager,
			kafkaOrdererFactory,
			ordererManagerOptions,
		);

		const collaborationSessionEvents = new TypedEventEmitter<ICollaborationSessionEvents>();

		// This wanst to create stuff
		const port = utils.normalizePort(process.env.PORT || "3000");

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

		const webSocketLibrary = config.get("nexus:webSocketLib");

		// Do not add the pub/sub connection manager to the list of managers to close
		// as these are gracefully closed by the web server factory
		// server/routerlicious/packages/services-shared/src/socketIoServer.ts Line 330
		const redisClientConnectionManagerForPub =
			customizations?.redisClientConnectionManagerForPub
				? customizations.redisClientConnectionManagerForPub
				: new RedisClientConnectionManager(
						undefined,
						redisConfig,
						redisConfig.enableClustering,
						redisConfig.slotsRefreshTimeout,
				  );

		const redisClientConnectionManagerForSub =
			customizations?.redisClientConnectionManagerForSub
				? customizations.redisClientConnectionManagerForSub
				: new RedisClientConnectionManager(
						undefined,
						redisConfig,
						redisConfig.enableClustering,
						redisConfig.slotsRefreshTimeout,
				  );

		const socketIoAdapterConfig = config.get("nexus:socketIoAdapter");
		const httpServerConfig: services.IHttpServerConfig = config.get("system:httpServer");
		const socketIoConfig = config.get("nexus:socketIo");
		const nodeClusterConfig: Partial<services.INodeClusterConfig> | undefined =
			config.get("nexus:nodeClusterConfig");
		const useNodeCluster = config.get("nexus:useNodeCluster");
		const webServerFactory = useNodeCluster
			? new services.SocketIoNodeClusterWebServerFactory(
					redisClientConnectionManagerForPub,
					redisClientConnectionManagerForSub,
					socketIoAdapterConfig,
					httpServerConfig,
					socketIoConfig,
					nodeClusterConfig,
					customizations?.customCreateSocketIoAdapter,
			  )
			: new services.SocketIoWebServerFactory(
					redisClientConnectionManagerForPub,
					redisClientConnectionManagerForSub,
					socketIoAdapterConfig,
					httpServerConfig,
					socketIoConfig,
					customizations?.customCreateSocketIoAdapter,
			  );

		const startupCheck = new StartupCheck();

		return new NexusResources(
			config,
			webServerFactory,
			clientManager,
			webSocketLibrary,
			orderManager,
			tenantManager,
			socketConnectTenantThrottler,
			socketConnectClusterThrottler,
			socketSubmitOpThrottler,
			socketSubmitSignalThrottler,
			redisJwtCache,
			storage,
			operationsDbMongoManager,
			port,
			documentsCollectionName,
			metricClientConfig,
			startupCheck,
			redisClientConnectionManagers,
			redisThrottleAndUsageStorageManager,
			verifyMaxMessageSize,
			redisCache,
			socketTracker,
			tokenRevocationManager,
			revokedTokenChecker,
			collaborationSessionEvents,
			serviceMessageResourceManager,
			customizations?.clusterDrainingChecker,
			collaborationSessionTracker,
			customizations?.readinessCheck,
		);
	}
}

/**
 * @internal
 */
export class NexusRunnerFactory implements core.IRunnerFactory<NexusResources> {
	public async create(resources: NexusResources): Promise<core.IRunner> {
		return new NexusRunner(
			resources.webServerFactory,
			resources.config,
			resources.port,
			resources.orderManager,
			resources.tenantManager,
			resources.socketConnectTenantThrottler,
			resources.socketConnectClusterThrottler,
			resources.socketSubmitOpThrottler,
			resources.socketSubmitSignalThrottler,
			resources.storage,
			resources.clientManager,
			resources.metricClientConfig,
			resources.startupCheck,
			resources.throttleAndUsageStorageManager,
			resources.verifyMaxMessageSize,
			resources.redisCache,
			resources.socketTracker,
			resources.tokenRevocationManager,
			resources.revokedTokenChecker,
			resources.collaborationSessionEvents,
			resources.clusterDrainingChecker,
			resources.collaborationSessionTracker,
			resources.readinessCheck,
		);
	}
}
