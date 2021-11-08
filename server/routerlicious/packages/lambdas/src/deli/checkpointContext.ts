/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IContext, IDeliState } from "@fluidframework/server-services-core";
import { getLumberBaseProperties, Lumberjack } from "@fluidframework/server-services-telemetry";
import { ICheckpointParams, IDeliCheckpointManager } from "./checkpointManager";

export class CheckpointContext {
    private pendingUpdateP: Promise<void> | undefined;
    private pendingCheckpoint: ICheckpointParams | undefined;
    private closed = false;
    private lastKafkaCheckpointOffset: number | undefined;

    constructor(
        private readonly tenantId: string,
        private readonly id: string,
        private readonly checkpointManager: IDeliCheckpointManager,
        private readonly context: IContext) {
    }

    /**
     * Checkpoints to the database & kafka
     * Note: This is an async method, but you should not await this
     */
    public async checkpoint(checkpoint: ICheckpointParams) {
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

        // Database checkpoint
        try {
            this.pendingUpdateP = this.checkpointCore(checkpoint);
            await this.pendingUpdateP;
        } catch (ex) {
            // TODO flag context as error / use this.context.error() instead?
            this.context.log?.error(
                `Error writing checkpoint to the database: ${JSON.stringify(ex)}`,
                {
                    messageMetaData: {
                        documentId: this.id,
                        tenantId: this.tenantId,
                    },
                });
            Lumberjack.error(`Error writing checkpoint to the database`,
                getLumberBaseProperties(this.id, this.tenantId), ex);
            return;
        }

        // Kafka checkpoint
        try {
            // depending on the sequence of events, it might try to checkpoint the same offset a second time
            // detect and prevent that case here
            const kafkaCheckpointMessage = checkpoint.kafkaCheckpointMessage;
            if (kafkaCheckpointMessage &&
                (this.lastKafkaCheckpointOffset === undefined ||
                    kafkaCheckpointMessage.offset > this.lastKafkaCheckpointOffset)) {
                this.lastKafkaCheckpointOffset = kafkaCheckpointMessage.offset;
                this.context.checkpoint(kafkaCheckpointMessage);
            }
        } catch (ex) {
            // TODO flag context as error / use this.context.error() instead?
            this.context.log?.error(
                `Error writing checkpoint to kafka: ${JSON.stringify(ex)}`,
                {
                    messageMetaData: {
                        documentId: this.id,
                        tenantId: this.tenantId,
                    },
                });
            Lumberjack.error(`Error writing checkpoint to the kafka`,
                getLumberBaseProperties(this.id, this.tenantId), ex);
        }

        this.pendingUpdateP = undefined;

        // Trigger another round if there is a pending update
        if (this.pendingCheckpoint) {
            const pendingCheckpoint = this.pendingCheckpoint;
            this.pendingCheckpoint = undefined;
            void this.checkpoint(pendingCheckpoint);
        }
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
            // clone the checkpoint
            const deliCheckpoint: IDeliState = { ...checkpoint.deliState };

            updateP = this.checkpointManager.writeCheckpoint(deliCheckpoint, checkpoint.reason);
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
            Lumberjack.error(`Error writing checkpoint to MongoDB`,
                getLumberBaseProperties(this.id, this.tenantId), error);
            return new Promise<void>((resolve, reject) => {
                resolve(this.checkpointCore(checkpoint));
            });
        });
    }
}
