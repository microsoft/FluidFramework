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
import { RedisOptions } from "ioredis";
import * as winston from "winston";

export async function deliCreate(
	config: Provider,
	customizations?: Record<string, any>,
): Promise<core.IPartitionLambdaFactory> {
	const kafkaEndpoint = config.get("kafka:lib:endpoint");
	const kafkaLibrary = config.get("kafka:lib:name");
	const kafkaProducerPollIntervalMs = config.get("kafka:lib:producerPollIntervalMs");
	const kafkaNumberOfPartitions = config.get("kafka:lib:numberOfPartitions");
	const kafkaReplicationFactor = config.get("kafka:lib:replicationFactor");
	const kafkaMaxBatchSize = config.get("kafka:lib:maxBatchSize");
	const kafkaSslCACertFilePath: string = config.get("kafka:lib:sslCACertFilePath");
	const eventHubConnString: string = config.get("kafka:lib:eventHubConnString");

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

	// Generate tenant manager which abstracts access to the underlying storage provider
	const authEndpoint = config.get("auth:endpoint");
	const internalHistorianUrl = config.get("worker:internalBlobStorageUrl");
	const tenantManager = new services.TenantManager(authEndpoint, internalHistorianUrl);
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

	let globalDb: core.IDb;
	if (globalDbEnabled) {
		const globalDbReconnect = (config.get("mongo:globalDbReconnect") as boolean) ?? false;
		const globalDbManager = new core.MongoManager(factory, globalDbReconnect, null, true);
		globalDb = await globalDbManager.getDatabase();
	}

	const operationsDbManager = new core.MongoManager(factory, false);
	const operationsDb = await operationsDbManager.getDatabase();

	const db: core.IDb = globalDbEnabled ? globalDb : operationsDb;

	// eslint-disable-next-line @typescript-eslint/await-thenable
	const collection = await db.collection<core.IDocument>(documentsCollectionName);
	// eslint-disable-next-line @typescript-eslint/await-thenable
	const localCollection = await operationsDb.collection<core.ICheckpoint>(
		checkpointsCollectionName,
	);
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
	);

	const redisConfig = config.get("redis");
	const redisOptions: RedisOptions = {
		host: redisConfig.host,
		port: redisConfig.port,
		password: redisConfig.pass,
	};
	if (redisConfig.tls) {
		redisOptions.tls = {
			servername: redisConfig.host,
		};
	}
	const publisher = new services.SocketIoRedisPublisher(redisOptions);
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
		},
	};

	const checkpointService = new core.CheckpointService(
		checkpointRepository,
		documentRepository,
		localCheckpointEnabled,
	);

	return new DeliLambdaFactory(
		operationsDbManager,
		documentRepository,
		checkpointService,
		tenantManager,
		undefined,
		combinedProducer,
		undefined,
		reverseProducer,
		serviceConfiguration,
	);
}

export async function create(
	config: Provider,
	customizations?: Record<string, any>,
): Promise<core.IPartitionLambdaFactory> {
	// Nconf has problems with prototype methods which prevents us from storing this as a class
	config.set("documentLambda", { create: deliCreate });
	return createDocumentRouter(config, customizations);
}
