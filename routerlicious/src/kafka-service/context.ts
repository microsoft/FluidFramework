import * as assert from "assert";
import { EventEmitter } from "events";
import { CheckpointManager } from "./checkpointManager";
import { IContext } from "./lambdas";

export class Context extends EventEmitter implements IContext {
    private offset;

    constructor(private checkpointManager: CheckpointManager) {
        super();
    }

    /**
     * Updates the checkpoint for the partition
     */
    public checkpoint(offset: number) {
        // We should only get increasing offsets from a context checkpoint
        assert(this.offset === undefined || offset >= this.offset);

        if (this.offset !== offset) {
            this.offset = offset;
            this.checkpointManager.checkpoint(offset).catch((error) => {
                // Close context on error. Once the checkpointManager enters an error state it will stay there.
                // We will look to restart on checkpointing given it likely indicates a Kafka connection issue.
                this.emit("close", error, true);
            });
        }
    }

    /**
     * Closes the context with an error. The restart flag indicates whether the error is recoverable and the lambda
     * should be restarted.
     */
    public close(error: any, restart: boolean) {
        this.emit("close", error, restart);
    }
}
