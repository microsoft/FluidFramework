/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ICheckpoint,
    ICollection,
	IDeliState,
	IDocument,
	IQueuedMessage,
} from "@fluidframework/server-services-core";
import { CheckpointReason } from "../utils";

export interface IDeliCheckpointManager {
	writeCheckpoint(checkpoint: IDeliState, isLocal: boolean, reason: CheckpointReason): Promise<void>;
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
    collection: ICollection<IDocument>,
    localCollection: ICollection<ICheckpoint>): IDeliCheckpointManager {
    const checkpointManager = {
        writeCheckpoint: async (checkpoint: IDeliState, isLocal: boolean) => {
            return isLocal ? localCollection.upsert({
                _id: documentId,
                documentId,
                tenantId,
            },
            {
                deli: JSON.stringify(checkpoint),
            },
            null) : collection.update({
                documentId,
                tenantId,
            },
            {
                deli: JSON.stringify(checkpoint),
            },
            null);
        },
        deleteCheckpoint: async (checkpointParams: ICheckpointParams, isLocal:boolean) => {
            return isLocal ? localCollection.upsert(
                {
                    _id: documentId,
                    documentId,
                    tenantId,
                },
                {
                    deli: "",
                },
                null) : collection.update(
                {
                    documentId,
                    tenantId,
                },
                {
                    deli: "",
                },
                null);
        }
    };
    return checkpointManager;
}
