import { utils as coreUtils } from "@prague/client-api";
import * as assert from "assert";
import * as utils from "../utils";

export class CheckpointManager {
    private checkpointing = false;
    private closed = false;
    private commitedOffset: number;
    private lastOffset: number;
    private pendingCheckpoint: coreUtils.Deferred<void>;
    private error: any;

    constructor(private id: number, private consumer: utils.IConsumer) {
    }

    /**
     * Requests a checkpoint at the given offset
     */
    public async checkpoint(offset: number) {
        // checkpoint calls should always be of increasing or equal value
        assert(this.lastOffset === undefined || offset >= this.lastOffset);

        // Exit early if the manager has been closed
        if (this.closed) {
            return;
        }

        // No recovery once entering an error state
        if (this.error) {
            return Promise.reject(this.error);
        }

        // Exit early if already caught up
        if (this.commitedOffset === offset) {
            return;
        }

        // Track the highest requested offset
        this.lastOffset = offset;

        // If already checkpointing allow the operation to complete to trigger another round.
        if (this.checkpointing) {
            // Create a promise that will resolve to the next checkpoint that will include the requested offset
            // and then return this as the result of checkpoint
            if (!this.pendingCheckpoint) {
                this.pendingCheckpoint = new coreUtils.Deferred<void>();
            }
            return this.pendingCheckpoint.promise;
        }

        // Finally begin checkpointing the offsets.
        this.checkpointing = true;
        const commitP = this.consumer.commitOffset([{ offset, partition: this.id }]);
        return commitP.then(
            () => {
                this.commitedOffset = offset;
                this.checkpointing = false;

                // Trigger another checkpoint round if the offset has moved since the checkpoint finished and
                // resolve any pending checkpoints to it.
                if (this.lastOffset !== this.commitedOffset) {
                    assert(this.pendingCheckpoint, "Differing offsets will always result in pendingCheckpoint");
                    const nextCheckpointP = this.checkpoint(this.lastOffset);
                    this.pendingCheckpoint.resolve(nextCheckpointP);
                    this.pendingCheckpoint = null;
                }
            },
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
     * Checkpoints at the last received offset. Returns the checkpointed offset.
     */
    public async flush(): Promise<void> {
        return this.checkpoint(this.lastOffset);
    }

    /**
     * Closes the checkpoint manager - this will stop it from performing any future checkpoints
     */
    public close(): void {
        this.closed = true;
    }
}
