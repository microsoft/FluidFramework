/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ICollection, IDeliState, IDocument, IQueuedMessage } from "@fluidframework/server-services-core";

export enum DeliCheckpointReason {
    EveryMessage,
    IdleTime,
    MaxTime,
    MaxMessages,
    ClearCache,
}

export interface IDeliCheckpointManager {
    writeCheckpoint(checkpoint: IDeliState, reason: DeliCheckpointReason): Promise<void>;
    deleteCheckpoint(checkpointParams: ICheckpointParams): Promise<void>;
}

export interface ICheckpointParams {
    /**
     * The reason why this checkpoint was triggered
     */
    reason: DeliCheckpointReason;

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
    collection: ICollection<IDocument>): IDeliCheckpointManager {
    const checkpointManager = {
        writeCheckpoint: async (checkpoint: IDeliState) => {
            return collection.update(
                {
                    documentId,
                    tenantId,
                },
                {
                    deli: JSON.stringify(checkpoint),
                },
                null);
        },
        deleteCheckpoint: async () => {
            return collection.update(
                {
                    documentId,
                    tenantId,
                },
                {
                    deli: "",
                },
                null);
        },
    };
    return checkpointManager;
}
