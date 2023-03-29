/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ICheckpointRepository,
	IDeliState,
	IDocumentRepository,
	IQueuedMessage,
} from "@fluidframework/server-services-core";
import { getLumberBaseProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import { CheckpointReason } from "../utils";

export interface IDeliCheckpointManager {
	writeCheckpoint(
		checkpoint: IDeliState,
		isLocal: boolean,
		reason: CheckpointReason,
	): Promise<void>;
	deleteCheckpoint(checkpointParams: ICheckpointParams, isLocal: boolean): Promise<void>;
}

export interface ICheckpointParams {
	/**
	 * The reason why this checkpoint was triggered
	 */
	reason: CheckpointReason;

	/**
	 * The deli checkpoint state \@ deliCheckpointMessage
	 */
	deliState: IDeliState;

	/**
	 * The message to checkpoint for deli (mongodb)
	 */
	deliCheckpointMessage: IQueuedMessage;

	/**
	 * The message to checkpoint for kafka
	 */
	kafkaCheckpointMessage: IQueuedMessage | undefined;

	/**
	 * Flag that decides if the deli checkpoint should be deleted
	 */
	clear?: boolean;
}

export function createDeliCheckpointManagerFromCollection(
	tenantId: string,
	documentId: string,
	documentRepository: IDocumentRepository,
	checkpointRepository: ICheckpointRepository,
): IDeliCheckpointManager {
	const checkpointManager = {
		writeCheckpoint: async (checkpoint: IDeliState, isLocal: boolean) => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return isLocal
				? checkpointRepository.updateOne(
						{
							documentId,
							tenantId,
						},
						{
							deli: JSON.stringify(checkpoint),
						},
						{ upsert: true },
				  )
				: documentRepository.updateOne(
						{
							documentId,
							tenantId,
						},
						{
							deli: JSON.stringify(checkpoint),
						},
				  );
		},
		deleteCheckpoint: async (checkpointParams: ICheckpointParams, isLocal: boolean) => {
			// eslint-disable-next-line @typescript-eslint/no-unsafe-return
			return isLocal
				? checkpointRepository.updateOne(
						{
							documentId,
							tenantId,
						},
						{
							deli: "",
						},
						null,
				  )
				: documentRepository.updateOne(
						{
							documentId,
							tenantId,
						},
						{
							deli: "",
						},
				  );
		},
	};
	return checkpointManager;
}

export async function getLatestCheckpoint(
	tenantId: string,
	documentId: string,
	documentRepository: IDocumentRepository,
	checkpointRepository: ICheckpointRepository,
	localCheckpointEnabled?: boolean,
	activeClients?: boolean,
): Promise<any> {
	if (localCheckpointEnabled === false) {
		// Not using checkpointRepository, use document repository
		return documentRepository.readOne({ documentId, tenantId });
	}

	if (activeClients === false) {
		// Local checkpoints are enabled, but no active clients, use document repository
		return documentRepository.readOne({ documentId, tenantId });
	}

	const checkpoint = await checkpointRepository
		.readOne({ documentId, tenantId })
		.catch((error) => {
			Lumberjack.error(
				`Error reading checkpoint from checkpoint collection.`,
				getLumberBaseProperties(documentId, tenantId),
				error,
			);
		});
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return checkpoint ? checkpoint : documentRepository.readOne({ documentId, tenantId });
}
