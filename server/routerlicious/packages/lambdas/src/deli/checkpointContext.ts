/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-null/no-null */

import { IRangeTrackerSnapshot } from "@microsoft/fluid-common-utils";
import { ICollection, IContext, IDocument, IQueuedMessage } from "@microsoft/fluid-server-services-core";

export interface IClientSequenceNumber {
    // Whether or not the object can expire
    canEvict: boolean;
    clientId: string;
    lastUpdate: number;
    nack: boolean;
    referenceSequenceNumber: number;
    clientSequenceNumber: number;
    scopes: string[];
}

export interface ICheckpointParams extends IDeliCheckpoint {
    queuedMessage: IQueuedMessage;
    clear?: boolean;
}

export interface IDeliCheckpoint {
    branchMap: IRangeTrackerSnapshot;
    clients: IClientSequenceNumber[];
    durableSequenceNumber: number;
    logOffset: number;
    sequenceNumber: number;
    epoch: number;
    term: number;
    lastTicketedTimestamp: number;
}

export class CheckpointContext {
    private pendingUpdateP: Promise<void>;
    private pendingCheckpoint: ICheckpointParams;
    private closed = false;

    constructor(
        private readonly tenantId: string,
        private readonly id: string,
        private readonly collection: ICollection<IDocument>,
        private readonly context: IContext) {
    }

    public checkpoint(checkpoint: ICheckpointParams) {
        // Exit early if already closed
        if (this.closed) {
            return;
        }

        // Check if a checkpoint is in progress - if so store the pending checkpoint
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        if (this.pendingUpdateP) {
            this.pendingCheckpoint = checkpoint;
            return;
        }

        // Write the checkpoint data to MongoDB
        this.pendingUpdateP = this.checkpointCore(checkpoint);
        this.pendingUpdateP.then(
            () => {
                this.context.checkpoint(checkpoint.queuedMessage);
                this.pendingUpdateP = null;

                // Trigger another round if there is a pending update
                if (this.pendingCheckpoint) {
                    const pendingCheckpoint = this.pendingCheckpoint;
                    this.pendingCheckpoint = null;
                    this.checkpoint(pendingCheckpoint);
                }
            },
            (error) => {
                // TODO flag context as error
                this.context.log.error(`Error writing checkpoint to MongoDB: ${JSON.stringify(error)}`);
            });
    }

    public close() {
        this.closed = true;
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    private checkpointCore(checkpoint: ICheckpointParams) {
        let deli = "";
        if (!checkpoint.clear) {
            const deliCheckpoint: IDeliCheckpoint = {
                branchMap: checkpoint.branchMap,
                clients: checkpoint.clients,
                durableSequenceNumber: checkpoint.durableSequenceNumber,
                logOffset: checkpoint.logOffset,
                sequenceNumber: checkpoint.sequenceNumber,
                epoch: checkpoint.epoch,
                term: checkpoint.term,
                lastTicketedTimestamp: checkpoint.lastTicketedTimestamp,
            };
            deli = JSON.stringify(deliCheckpoint);
        }
        const updateP = this.collection.update(
            {
                documentId: this.id,
                tenantId: this.tenantId,
            },
            {
                deli,
            },
            null);

        // Retry the checkpoint on error
        // eslint-disable-next-line @typescript-eslint/promise-function-async
        return updateP.catch((error) => {
            this.context.log.error(`Error writing checkpoint to MongoDB: ${JSON.stringify(error)}`);
            return new Promise<void>((resolve, reject) => {
                resolve(this.checkpointCore(checkpoint));
            });
        });
    }
}
