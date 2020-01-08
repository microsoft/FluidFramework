/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import * as assert from "assert";
import { Deferred } from "@microsoft/fluid-core-utils";
import { IConsumer, IKafkaMessage } from "@microsoft/fluid-server-services-core";

export class CheckpointManager {
    private checkpointing = false;
    private closed = false;
    private commitedMessage: IKafkaMessage;
    private lastMessage: IKafkaMessage;
    private pendingCheckpoint: Deferred<void> | undefined;
    private error: any;

    constructor(private readonly id: number, private readonly consumer: IConsumer) {
    }

    /**
     * Requests a checkpoint at the given offset
     */
    public async checkpoint(message: IKafkaMessage) {
        // Checkpoint calls should always be of increasing or equal value
        const offset = message.offset;
        assert(this.lastMessage === undefined || offset >= this.lastMessage.offset);

        // Exit early if the manager has been closed
        if (this.closed) {
            return;
        }

        // No recovery once entering an error state
        if (this.error) {
            return Promise.reject(this.error);
        }

        // Exit early if already caught up
        if (this.commitedMessage === message) {
            return;
        }

        // Track the highest requested offset
        this.lastMessage = message;

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
        const commitP = this.consumer.commitOffset(message, [{ offset, partition: this.id }]);
        return commitP.then(
            () => {
                this.commitedMessage = message;
                this.checkpointing = false;

                // Trigger another checkpoint round if the offset has moved since the checkpoint finished and
                // resolve any pending checkpoints to it.
                if (this.lastMessage !== this.commitedMessage) {
                    assert(this.pendingCheckpoint, "Differing offsets will always result in pendingCheckpoint");
                    const nextCheckpointP = this.checkpoint(this.lastMessage);
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
        if (this.lastMessage) {
            return this.checkpoint(this.lastMessage);
        }
    }

    /**
     * Closes the checkpoint manager - this will stop it from performing any future checkpoints
     */
    public close(): void {
        this.closed = true;
    }
}
