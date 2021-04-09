/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContext, IDeliState } from "@fluidframework/server-services-core";
import { ICheckpointParams, IDeliCheckpointManager } from "./checkpointManager";

export class CheckpointContext {
    private pendingUpdateP: Promise<void> | undefined;
    private pendingCheckpoint: ICheckpointParams | undefined;
    private closed = false;

    constructor(
        private readonly tenantId: string,
        private readonly id: string,
        private readonly checkpointManager: IDeliCheckpointManager,
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
        this.pendingUpdateP?.then(
            () => {
                this.context.checkpoint(checkpoint.queuedMessage);
                this.pendingUpdateP = undefined;

                // Trigger another round if there is a pending update
                if (this.pendingCheckpoint) {
                    const pendingCheckpoint = this.pendingCheckpoint;
                    this.pendingCheckpoint = undefined;
                    this.checkpoint(pendingCheckpoint);
                }
            },
            (error) => {
                // TODO flag context as error
                this.context.log?.error(
                    `Error writing checkpoint to MongoDB: ${JSON.stringify(error)}`,
                    {
                        messageMetaData: {
                            documentId: this.id,
                            tenantId: this.tenantId,
                        },
                    });
            });
    }

    public close() {
        this.closed = true;
    }

    // eslint-disable-next-line @typescript-eslint/promise-function-async
    private checkpointCore(checkpoint: ICheckpointParams) {
        // Exit early if already closed
        if (this.closed) {
            return;
        }

        let updateP: Promise<void>;

        if (checkpoint.clear) {
            updateP = this.checkpointManager.deleteCheckpoint(checkpoint);
        } else {
            const deliCheckpoint: IDeliState = {
                branchMap: checkpoint.branchMap,
                clients: checkpoint.clients,
                durableSequenceNumber: checkpoint.durableSequenceNumber,
                logOffset: checkpoint.logOffset,
                sequenceNumber: checkpoint.sequenceNumber,
                epoch: checkpoint.epoch,
                term: checkpoint.term,
                lastSentMSN: checkpoint.lastSentMSN,
            };

            updateP = this.checkpointManager.writeCheckpoint(deliCheckpoint);
        }

        // Retry the checkpoint on error
        // eslint-disable-next-line @typescript-eslint/promise-function-async
        return updateP.catch((error) => {
            this.context.log?.error(
                `Error writing checkpoint to MongoDB: ${JSON.stringify(error)}`,
                {
                    messageMetaData: {
                        documentId: this.id,
                        tenantId: this.tenantId,
                    },
                });
            return new Promise<void>((resolve, reject) => {
                resolve(this.checkpointCore(checkpoint));
            });
        });
    }
}
