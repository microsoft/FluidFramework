/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IContext, ICheckpointOffset } from "@microsoft/fluid-server-services-core";
import { CheckpointManager } from "./checkpointManager";

export class Context extends EventEmitter implements IContext {
    private closed = false;

    constructor(private readonly checkpointManager: CheckpointManager) {
        super();
    }

    /**
     * Updates the checkpoint for the partition
     */
    public checkpoint(checkpointOffset: ICheckpointOffset) {
        if (this.closed) {
            return;
        }

        this.checkpointManager.checkpoint(checkpointOffset).catch((error) => {
            // Close context on error. Once the checkpointManager enters an error state it will stay there.
            // We will look to restart on checkpointing given it likely indicates a Kafka connection issue.
            this.emit("error", error, true);
        });
    }

    /**
     * Closes the context with an error. The restart flag indicates whether the error is recoverable and the lambda
     * should be restarted.
     */
    public error(error: any, restart: boolean) {
        this.emit("error", error, restart);
    }

    /**
     * Closes the context
     */
    public close(): void {
        this.closed = true;
    }
}
