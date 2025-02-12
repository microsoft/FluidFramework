/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { BroadcasterLambda, DeliLambdaFactory } from "@fluidframework/server-lambdas";
import { createDocumentRouter } from "@fluidframework/server-routerlicious-base";
import {
	LocalKafka,
	LocalContext,
	LocalLambdaController,
} from "@fluidframework/server-memory-orderer";
import * as services from "@fluidframework/server-services";
import * as core from "@fluidframework/server-services-core";
import { Lumberjack } from "@fluidframework/server-services-telemetry";
import { Provider } from "nconf";
import { RedisOptions, ClusterOptions } from "ioredis";
import * as winston from "winston";
import {
	RedisClientConnectionManager,
	type IRedisClientConnectionManager,
} from "@fluidframework/server-services-utils";

export async function deliCreate(
	config: Provider,
	customizations?: Record<string, any>,
): Promise<core.IPartitionLambdaFactory<core.IPartitionLambdaConfig>> {
	const kafkaEndpoint = config.get("kafka:lib:endpoint");
	const kafkaLibrary = config.get("kafka:lib:name");
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

	const kafkaForwardClientId = config.get("deli:kafkaClientId");
	const kafkaReverseClientId = config.get("alfred:kafkaClientId");

	const forwardSendTopic = config.get("deli:topics:send");
	const reverseSendTopic = config.get("alfred:topic");

	const documentsCollectionName = config.get("mongo:collectionNames:documents");
	const checkpointsCollectionName = config.get("mongo:collectionNames:checkpoints");

	const localCheckpointEnabled = config.get("checkpoints:localCheckpointEnabled");

	const restartOnCheckpointFailure =
		(config.get("deli:restartOnCheckpointFailure") as boolean) ?? true;

	const kafkaCheckpointOnReprocessingOp =
		(config.get("checkpoints:kafkaCheckpointOnReprocessingOp") as boolean) ?? true;

	const enableLeaveOpNoClientServerMetadata =
		(config.get("deli:enableLeaveOpNoClientServerMetadata") as boolean) ?? false;

	const noOpConsolidationTimeout = config.get("deli:noOpConsolidationTimeout");

	// Generate tenant manager which abstracts access to the underlying storage provider
	const authEndpoint = config.get("auth:endpoint");
	const internalHistorianUrl = config.get("worker:internalBlobStorageUrl");
	const enableHistorianApiV2: boolean = config.get("storage:enableHistorianApiV2") ?? false;
	const tenantManager = new services.TenantManager(authEndpoint, internalHistorianUrl, {
		enableHistorianApiV2,
	});
	const globalDbEnabled = config.get("mongo:globalDbEnabled") as boolean;
	// Database connection for global db if enabled
	const factory = await services.getDbFactory(config);

	const checkpointHeuristics = config.get(
		"deli:checkpointHeuristics",
	) as core.ICheckpointHeuristicsServerConfiguration;
	// eslint-disable-next-line @typescript-eslint/prefer-optional-chain
	if (checkpointHeuristics && checkpointHeuristics.enable) {
		core.DefaultServiceConfiguration.deli.checkpointHeuristics = checkpointHeuristics;
	}

	const enableEphemeralContainerSummaryCleanup =
		(config.get("deli:enableEphemeralContainerSummaryCleanup") as boolean | undefined) ?? true;
	core.DefaultServiceConfiguration.deli.enableEphemeralContainerSummaryCleanup =
		enableEphemeralContainerSummaryCleanup;

	const ephemeralContainerSoftDeleteTimeInMs =
		(config.get("deli:ephemeralContainerSoftDeleteTimeInMs") as number | undefined) ?? -1; // -1 means not soft deletion but hard deletion directly
	core.DefaultServiceConfiguration.deli.ephemeralContainerSoftDeleteTimeInMs =
		ephemeralContainerSoftDeleteTimeInMs;

	let globalDb: core.IDb | undefined;
	if (globalDbEnabled) {
		const globalDbReconnect = (config.get("mongo:globalDbReconnect") as boolean) ?? false;
		const globalDbManager = new core.MongoManager(
			factory,
			globalDbReconnect,
			undefined /* reconnectDelayMs */,
			true /* global */,
		);
		globalDb = await globalDbManager.getDatabase();
	}

	const operationsDbManager = new core.MongoManager(factory, false);
	const operationsDb = await operationsDbManager.getDatabase();

	const db: core.IDb = globalDbEnabled && globalDb !== undefined ? globalDb : operationsDb;

	// eslint-disable-next-line @typescript-eslint/await-thenable
	const collection = await db.collection<core.IDocument>(documentsCollectionName);
	const localCollection =
		// eslint-disable-next-line @typescript-eslint/await-thenable
		await operationsDb.collection<core.ICheckpoint>(checkpointsCollectionName);
	const documentRepository =
		customizations?.documentRepository ?? new core.MongoDocumentRepository(collection);
	const checkpointRepository = new core.MongoCheckpointRepository(localCollection, "deli");

	const forwardProducer = services.createProducer(
		kafkaLibrary,
		kafkaEndpoint,
		kafkaForwardClientId,
		forwardSendTopic,
		true,
		kafkaProducerPollIntervalMs,
		kafkaNumberOfPartitions,
		kafkaReplicationFactor,
		kafkaMaxBatchSize,
		kafkaSslCACertFilePath,
		eventHubConnString,
		kafkaProducerGlobalAdditionalConfig,
		oauthBearerConfig,
	);
	const reverseProducer = services.createProducer(
		kafkaLibrary,
		kafkaEndpoint,
		kafkaReverseClientId,
		reverseSendTopic,
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
	const redisOptions: RedisOptions & ClusterOptions = {
		host: redisConfig.host,
		port: redisConfig.port,
		password: redisConfig.pass,
	};
	if (redisConfig.tls) {
		redisOptions.tls = {
			servername: redisConfig.host,
		};
	}
	const redisClientConnectionManager: IRedisClientConnectionManager =
		customizations?.redisClientConnectionManager ??
		new RedisClientConnectionManager(
			redisOptions,
			undefined,
			redisConfig.enableClustering,
			redisConfig.slotsRefreshTimeout,
		);
	// The socketioredispublisher handles redis connection graceful shutdown
	const publisher = new services.SocketIoRedisPublisher(redisClientConnectionManager);
	publisher.on("error", (err) => {
		winston.error("Error with Redis Publisher:", err);
		Lumberjack.error("Error with Redis Publisher:", undefined, err);
	});

	const localContext = new LocalContext(winston);

	const localProducer = new LocalKafka();
	const combinedProducer = new core.CombinedProducer([forwardProducer, localProducer], true);

	const broadcasterLambda = new LocalLambdaController(
		localProducer,
		undefined,
		localContext,
		async (_, context: LocalContext) =>
			new BroadcasterLambda(publisher, context, core.DefaultServiceConfiguration, undefined),
	);

	await broadcasterLambda.start();

	const externalOrdererUrl: string = config.get("worker:serverUrl");
	const enforceDiscoveryFlow: boolean = config.get("worker:enforceDiscoveryFlow");
	const serviceConfiguration: core.IServiceConfiguration = {
		...core.DefaultServiceConfiguration,
		externalOrdererUrl,
		enforceDiscoveryFlow,
		deli: {
			...core.DefaultServiceConfiguration.deli,
			restartOnCheckpointFailure,
			kafkaCheckpointOnReprocessingOp,
			enableLeaveOpNoClientServerMetadata,
			noOpConsolidationTimeout,
		},
	};

	const checkpointService = new core.CheckpointService(
		checkpointRepository,
		documentRepository,
		localCheckpointEnabled,
	);

	const deliLambdaFactory = new DeliLambdaFactory(
		operationsDbManager,
		documentRepository,
		checkpointService,
		tenantManager,
		undefined,
		combinedProducer,
		undefined,
		reverseProducer,
		serviceConfiguration,
		customizations?.clusterDrainingChecker,
	);

	deliLambdaFactory.on("dispose", () => {
		broadcasterLambda.close();
		publisher.close().catch((error) => {
			Lumberjack.error("Error closing publisher", undefined, error);
		});
	});

	return deliLambdaFactory;
}

export async function create(
	config: Provider,
	customizations?: Record<string, any>,
): Promise<core.IPartitionLambdaFactory> {
	// Nconf has problems with prototype methods which prevents us from storing this as a class
	config.set("documentLambda", { create: deliCreate });
	return createDocumentRouter(config, customizations);
}
