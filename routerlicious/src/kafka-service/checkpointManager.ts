import * as assert from "assert";
import * as winston from "winston";
import * as utils from "../utils";

export interface ICheckpointStrategy {
    shouldCheckpoint(offset: number): boolean;
}

export class CheckpointManager {
    private checkpointing = false;
    private commitedOffset: number;
    private lastOffset: number;

    constructor(
        private id: number,
        private checkpointStrategy: ICheckpointStrategy,
        private consumer: utils.kafkaConsumer.IConsumer) {
    }

    /**
     * Requests a checkpoint at the given offset
     */
    public checkpoint(offset: number) {
        this.lastOffset = offset;

        // If already checkpointing allow the operation to complete to trigger another round.
        if (this.checkpointing) {
            return;
        }

        // Base case for when there are not enough messages to trigger checkpointing.
        if (!this.checkpointStrategy.shouldCheckpoint(offset)) {
            return;
        }

        // Finally begin checkpointing the offsets.
        this.checkpointing = true;
        const commitP = this.consumer.commitOffset([{ offset, partition: this.id }]);
        const doneP = commitP.then(
            () => {
                this.commitedOffset = offset;
            },
            (error) => {
                // TODO on an error what should I do here? Just try to checkpoint again? Stop processing? Kill
                // the process? If we can't checkpoint we probably also can't receive messages
                winston.error(`${this.consumer.groupId}:${this.id} Error checkpointing kafka offset`, error);
            });

        doneP.then(
            () => {
                // Trigger another checkpoint round if the offset has moved since the checkpoint finished
                this.checkpointing = false;
                if (this.lastOffset !== this.commitedOffset) {
                    this.checkpoint(this.lastOffset);
                }
            },
            (error) => {
                assert.ok(false);
            });
    }

    /**
     * Checkpoints at the last received offset. Returns the checkpointed offset.
     */
    public flush(): Promise<void> {
        // TODO fully implement this if current checkpoint plan makes sense
        return Promise.resolve();
    }
}
