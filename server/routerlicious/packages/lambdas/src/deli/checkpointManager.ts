/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	IDeliState,
	IDocumentRepository,
	IQueuedMessage,
} from "@fluidframework/server-services-core";
import { CheckpointReason } from "../utils";

export interface IDeliCheckpointManager {
	writeCheckpoint(checkpoint: IDeliState, reason: CheckpointReason): Promise<void>;
	deleteCheckpoint(checkpointParams: ICheckpointParams): Promise<void>;
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
): IDeliCheckpointManager {
	const checkpointManager = {
		writeCheckpoint: async (checkpoint: IDeliState) => {
			await documentRepository.updateOne(
				{ tenantId, documentId },
				{
					deli: JSON.stringify(checkpoint),
				},
			);
		},
		deleteCheckpoint: async () => {
			await documentRepository.updateOne(
				{ tenantId, documentId },
				{
					deli: "",
				},
			);
		},
	};
	return checkpointManager;
}
