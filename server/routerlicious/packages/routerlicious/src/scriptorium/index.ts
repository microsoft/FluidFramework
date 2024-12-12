/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ScriptoriumLambdaFactory } from "@fluidframework/server-lambdas";
import * as services from "@fluidframework/server-services";
import {
	CheckpointService,
	IPartitionLambdaFactory,
	MongoCheckpointRepository,
	MongoDocumentRepository,
	MongoManager,
} from "@fluidframework/server-services-core";
import {
	deleteSummarizedOps,
	executeOnInterval,
	FluidServiceErrorCode,
} from "@fluidframework/server-services-utils";
import { Provider } from "nconf";

export async function create(
	config: Provider,
	customizations?: Record<string, any>,
): Promise<IPartitionLambdaFactory> {
	const globalDbEnabled = config.get("mongo:globalDbEnabled") as boolean;
	const mongoExpireAfterSeconds = config.get("mongo:expireAfterSeconds") as number;
	const deltasCollectionName = config.get("mongo:collectionNames:deltas");
	const documentsCollectionName = config.get("mongo:collectionNames:documents");
	const checkpointsCollectionName = config.get("mongo:collectionNames:checkpoints");
	const createCosmosDBIndexes = config.get("mongo:createCosmosDBIndexes") as boolean;

	const softDeletionRetentionPeriodMs = config.get(
		"mongo:softDeletionRetentionPeriodMs",
	) as number;
	const offlineWindowMs = config.get("mongo:offlineWindowMs") as number;
	const softDeletionEnabled = config.get("mongo:softDeletionEnabled") as boolean;
	const permanentDeletionEnabled = config.get("mongo:permanentDeletionEnabled") as boolean;
	const deletionIntervalMs = config.get("mongo:deletionIntervalMs") as number;

	const enableTelemetry = (config.get("scriptorium:enableTelemetry") as boolean) ?? false;
	const shouldLogInitialSuccessVerbose =
		(config.get("scriptorium:shouldLogInitialSuccessVerbose") as boolean) ?? false;
	const maxDbBatchSize = config.get("scriptorium:maxDbBatchSize") as number;
	const restartOnCheckpointFailure =
		(config.get("scriptorium:restartOnCheckpointFailure") as boolean) ?? true;
	const logSavedOpsTimeIntervalMs =
		(config.get("scriptorium:logSavedOpsTimeIntervalMs") as number) ?? 60000;
	const opsCountTelemetryEnabled =
		(config.get("scriptorium:opsCountTelemetryEnabled") as boolean) ?? false;
	const circuitBreakerEnabled =
		(config.get("scriptorium:circuitBreakerEnabled") as boolean) ?? false;
	const circuitBreakerOptions =
		(config.get("scriptorium:circuitBreakerOptions") as Record<string, any>) ?? {};

	const factory = await services.getDbFactory(config);

	const operationsDbManager = new MongoManager(factory, false);
	const operationsDb = await operationsDbManager.getDatabase();

	const opCollection = operationsDb.collection(deltasCollectionName);

	if (createCosmosDBIndexes) {
		await opCollection.createIndex({ tenantId: 1 }, false);
		await opCollection.createIndex({ documentId: 1 }, false);
		await opCollection.createIndex({ "operation.timestamp": 1 }, false);
		await opCollection.createIndex({ scheduledDeletionTime: 1 }, false);
		await opCollection.createIndex({ "operation.sequenceNumber": 1 }, false);
	} else {
		await opCollection.createIndex(
			{
				"documentId": 1,
				"operation.sequenceNumber": 1,
				"tenantId": 1,
			},
			true,
		);
	}

	if (mongoExpireAfterSeconds > 0 && opCollection.createTTLIndex !== undefined) {
		await (createCosmosDBIndexes
			? opCollection.createTTLIndex({ _ts: 1 }, mongoExpireAfterSeconds)
			: opCollection.createTTLIndex({ mongoTimestamp: 1 }, mongoExpireAfterSeconds));
	}

	if (softDeletionEnabled) {
		let globalDb;
		// Database connection for global db if enabled
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
		const documentsCollectionDb = globalDbEnabled ? globalDb : operationsDb;

		const documentRepository =
			customizations?.documentRepository ??
			new MongoDocumentRepository(documentsCollectionDb.collection(documentsCollectionName));

		// Required for checkpoint service
		const checkpointRepository = new MongoCheckpointRepository(
			operationsDb.collection(checkpointsCollectionName),
			"scriptorium" /* checkpoint type */,
		);
		const isLocalCheckpointEnabled = config.get("checkpoints: localCheckpointEnabled");

		const checkpointService = new CheckpointService(
			checkpointRepository,
			documentRepository,
			isLocalCheckpointEnabled,
		);

		executeOnInterval(
			async () =>
				deleteSummarizedOps(
					opCollection,
					softDeletionRetentionPeriodMs,
					offlineWindowMs,
					softDeletionEnabled,
					permanentDeletionEnabled,
					checkpointService,
				),
			deletionIntervalMs,
			"deleteSummarizedOps",
			undefined,
			(error) => {
				return error.code === FluidServiceErrorCode.FeatureDisabled;
			},
		);
	}

	return new ScriptoriumLambdaFactory(operationsDbManager, opCollection, {
		enableTelemetry,
		maxDbBatchSize,
		restartOnCheckpointFailure,
		shouldLogInitialSuccessVerbose,
		logSavedOpsTimeIntervalMs,
		opsCountTelemetryEnabled,
		circuitBreakerEnabled,
		circuitBreakerOptions,
	});
}
