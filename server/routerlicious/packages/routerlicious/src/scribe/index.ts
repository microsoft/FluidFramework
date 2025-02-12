/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScribeLambdaFactory } from "@fluidframework/server-lambdas";
import { createDocumentRouter } from "@fluidframework/server-routerlicious-base";
import {
	createProducer,
	getDbFactory,
	DeltaManager,
	TenantManager,
} from "@fluidframework/server-services";
import * as core from "@fluidframework/server-services-core";
import {
	DefaultServiceConfiguration,
	ICheckpointHeuristicsServerConfiguration,
	ICheckpoint,
	IDb,
	IDocument,
	IPartitionLambdaFactory,
	ISequencedOperationMessage,
	IServiceConfiguration,
	MongoDocumentRepository,
	MongoManager,
} from "@fluidframework/server-services-core";
import { Provider } from "nconf";

export async function scribeCreate(
	config: Provider,
	customizations?: Record<string, any>,
): Promise<IPartitionLambdaFactory<core.IPartitionLambdaConfig>> {
	// Access config values
	const globalDbEnabled = config.get("mongo:globalDbEnabled") as boolean;
	const documentsCollectionName = config.get("mongo:collectionNames:documents");
	const checkpointsCollectionName = config.get("mongo:collectionNames:checkpoints");
	const messagesCollectionName = config.get("mongo:collectionNames:scribeDeltas");
	const createCosmosDBIndexes = config.get("mongo:createCosmosDBIndexes");

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
	const sendTopic = config.get("lambdas:deli:topic");
	const kafkaClientId = config.get("scribe:kafkaClientId");
	const mongoExpireAfterSeconds = config.get("mongo:expireAfterSeconds") as number;
	const enableWholeSummaryUpload = config.get("storage:enableWholeSummaryUpload") as boolean;
	const internalAlfredUrl = config.get("worker:alfredUrl");
	const getDeltasViaAlfred = config.get("scribe:getDeltasViaAlfred") as boolean;
	const maxLogtailLength = (config.get("scribe:maxLogtailLength") as number) ?? 2000;
	const maxPendingCheckpointMessagesLength =
		(config.get("scribe:maxPendingCheckpointMessagesLength") as number) ?? 2000;
	const verifyLastOpPersistence =
		(config.get("scribe:verifyLastOpPersistence") as boolean) ?? false;
	const transientTenants = config.get("shared:transientTenants") as string[];
	const disableTransientTenantFiltering =
		(config.get("scribe:disableTransientTenantFiltering") as boolean) ?? true;
	const localCheckpointEnabled = config.get("checkpoints:localCheckpointEnabled") as boolean;
	const restartOnCheckpointFailure =
		(config.get("scribe:restartOnCheckpointFailure") as boolean) ?? true;
	const kafkaCheckpointOnReprocessingOp =
		(config.get("checkpoints:kafkaCheckpointOnReprocessingOp") as boolean) ?? true;

	// Generate tenant manager which abstracts access to the underlying storage provider
	const authEndpoint = config.get("auth:endpoint");
	const internalHistorianUrl = config.get("worker:internalBlobStorageUrl");
	const enableHistorianApiV2: boolean = config.get("storage:enableHistorianApiV2") ?? false;
	const tenantManager = new TenantManager(authEndpoint, internalHistorianUrl, {
		enableHistorianApiV2,
	});

	const deltaManager = new DeltaManager(authEndpoint, internalAlfredUrl);
	const factory = await getDbFactory(config);

	const checkpointHeuristics = config.get(
		"scribe:checkpointHeuristics",
	) as ICheckpointHeuristicsServerConfiguration;
	if (checkpointHeuristics?.enable) {
		core.DefaultServiceConfiguration.scribe.checkpointHeuristics = checkpointHeuristics;
	}

	let globalDb;
	if (globalDbEnabled) {
		const globalDbReconnect = (config.get("mongo:globalDbReconnect") as boolean) ?? false;
		const globalDbMongoManager = new MongoManager(
			factory,
			globalDbReconnect,
			undefined /* reconnectDelayMs */,
			true /* global */,
		);
		globalDb = await globalDbMongoManager.getDatabase();
	}

	const operationsDbManager = new MongoManager(factory, false);
	const operationsDb = await operationsDbManager.getDatabase();

	const documentsCollectionDb: IDb = globalDbEnabled ? globalDb : operationsDb;

	const scribeDeltas =
		operationsDb.collection<ISequencedOperationMessage>(messagesCollectionName);
	const documentRepository =
		customizations?.documentRepository ??
		new MongoDocumentRepository(
			documentsCollectionDb.collection<IDocument>(documentsCollectionName),
		);

	const checkpointRepository = new core.MongoCheckpointRepository(
		operationsDb.collection<ICheckpoint>(checkpointsCollectionName),
		"scribe",
	);

	if (createCosmosDBIndexes) {
		await scribeDeltas.createIndex({ documentId: 1 }, false);
		await scribeDeltas.createIndex({ tenantId: 1 }, false);
		await scribeDeltas.createIndex({ "operation.sequenceNumber": 1 }, false);
	} else {
		await scribeDeltas.createIndex(
			{
				"documentId": 1,
				"operation.sequenceNumber": 1,
				"tenantId": 1,
			},
			true,
		);
	}

	if (mongoExpireAfterSeconds > 0 && scribeDeltas.createTTLIndex !== undefined) {
		await (createCosmosDBIndexes
			? scribeDeltas.createTTLIndex({ _ts: 1 }, mongoExpireAfterSeconds)
			: scribeDeltas.createTTLIndex({ mongoTimestamp: 1 }, mongoExpireAfterSeconds));
	}

	const producer = createProducer(
		kafkaLibrary,
		kafkaEndpoint,
		kafkaClientId,
		sendTopic,
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

	const externalOrdererUrl = config.get("worker:serverUrl");
	const enforceDiscoveryFlow: boolean = config.get("worker:enforceDiscoveryFlow");
	const scrubUserDataInGlobalCheckpoints: boolean =
		config.get("scribe:scrubUserDataInGlobalCheckpoints") ??
		DefaultServiceConfiguration.scribe.scrubUserDataInGlobalCheckpoints;
	const scrubUserDataInLocalCheckpoints: boolean =
		config.get("scribe:scrubUserDataInLocalCheckpoints") ??
		DefaultServiceConfiguration.scribe.scrubUserDataInLocalCheckpoints;
	const scrubUserDataInSummaries: boolean =
		config.get("scribe:scrubUserDataInSummaries") ??
		DefaultServiceConfiguration.scribe.scrubUserDataInSummaries;
	const serviceConfiguration: IServiceConfiguration = {
		...DefaultServiceConfiguration,
		externalOrdererUrl,
		enforceDiscoveryFlow,
		scribe: {
			...DefaultServiceConfiguration.scribe,
			scrubUserDataInGlobalCheckpoints,
			scrubUserDataInLocalCheckpoints,
			scrubUserDataInSummaries,
		},
	};

	const checkpointService = new core.CheckpointService(
		checkpointRepository,
		documentRepository,
		localCheckpointEnabled,
	);

	return new ScribeLambdaFactory(
		operationsDbManager,
		documentRepository,
		scribeDeltas,
		producer,
		deltaManager,
		tenantManager,
		serviceConfiguration,
		enableWholeSummaryUpload,
		getDeltasViaAlfred,
		verifyLastOpPersistence,
		transientTenants,
		disableTransientTenantFiltering,
		checkpointService,
		restartOnCheckpointFailure,
		kafkaCheckpointOnReprocessingOp,
		maxLogtailLength,
		maxPendingCheckpointMessagesLength,
	);
}

export async function create(
	config: Provider,
	customizations?: Record<string, any>,
): Promise<IPartitionLambdaFactory> {
	// Nconf has problems with prototype methods which prevents us from storing this as a class
	config.set("documentLambda", { create: scribeCreate });
	return createDocumentRouter(config, customizations);
}
