/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-null/no-null */

import { ICollection, IDeliState, IDocument, IQueuedMessage } from "@fluidframework/server-services-core";

export interface IDeliCheckpointManager {
    writeCheckpoint(checkpoint: IDeliState): Promise<void>;
    deleteCheckpoint(checkpointParams: ICheckpointParams): Promise<void>;
}

export interface ICheckpointParams extends IDeliState {
    queuedMessage: IQueuedMessage;
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
