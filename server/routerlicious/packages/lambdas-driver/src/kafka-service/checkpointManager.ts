/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { Deferred } from "@fluidframework/common-utils";
import { IConsumer, IQueuedMessage } from "@fluidframework/server-services-core";

export class CheckpointManager {
    private checkpointing = false;
    private closed = false;
    private commitedCheckpoint: IQueuedMessage | undefined;
    private lastCheckpoint: IQueuedMessage | undefined;
    private pendingCheckpoint: Deferred<void> | undefined;
    private error: any;

    constructor(private readonly id: number, private readonly consumer: IConsumer) {
    }

    /**
     * Requests a checkpoint at the given offset
     */
    public async checkpoint(queuedMessage: IQueuedMessage) {
        // Checkpoint calls should always be of increasing or equal value
        assert(this.lastCheckpoint === undefined || queuedMessage.offset >= this.lastCheckpoint.offset);

        // Exit early if the manager has been closed
        if (this.closed) {
            return;
        }

        // No recovery once entering an error state
        if (this.error) {
            return Promise.reject(this.error);
        }

        // Exit early if already caught up
        if (this.commitedCheckpoint === queuedMessage) {
            return;
        }

        // Track the highest requested offset
        this.lastCheckpoint = queuedMessage;

        // If already checkpointing allow the operation to complete to trigger another round.
        if (this.checkpointing) {
            // Create a promise that will resolve to the next checkpoint that will include the requested offset
            // and then return this as the result of checkpoint
            if (!this.pendingCheckpoint) {
                this.pendingCheckpoint = new Deferred<void>();
            }
            return this.pendingCheckpoint.promise;
        }

        // Finally begin checkpointing the offsets.
        this.checkpointing = true;
        const commitP = this.consumer.commitCheckpoint(this.id, queuedMessage);
        return commitP.then(
            () => {
                this.commitedCheckpoint = queuedMessage;
                this.checkpointing = false;

                // Trigger another checkpoint round if the offset has moved since the checkpoint finished and
                // resolve any pending checkpoints to it.
                if (this.lastCheckpoint && this.lastCheckpoint !== this.commitedCheckpoint) {
                    assert(this.pendingCheckpoint, "Differing offsets will always result in pendingCheckpoint");
                    const nextCheckpointP = this.checkpoint(this.lastCheckpoint);
                    this.pendingCheckpoint.resolve(nextCheckpointP);
                    this.pendingCheckpoint = undefined;
                } else if (this.pendingCheckpoint) {
                    this.pendingCheckpoint.resolve();
                    this.pendingCheckpoint = undefined;
                }
            },
            // eslint-disable-next-line @typescript-eslint/promise-function-async
            (error) => {
                // Enter an error state on any commit error
                this.error = error;
                if (this.pendingCheckpoint) {
                    this.pendingCheckpoint.reject(this.error);
                }
                return Promise.reject(error);
            });
    }

    /**
     * Checkpoints at the last received offset.
     */
    public async flush(): Promise<void> {
        if (this.lastCheckpoint) {
            return this.checkpoint(this.lastCheckpoint);
        }
    }

    /**
     * Closes the checkpoint manager - this will stop it from performing any future checkpoints
     */
    public close(): void {
        this.closed = true;
    }
}
