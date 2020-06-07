/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { EventEmitter } from "events";
import { IContext, IQueuedMessage, ILogger } from "@fluidframework/server-services-core";
import * as winston from "winston";
import { CheckpointManager } from "./checkpointManager";

export class Context extends EventEmitter implements IContext {
    private closed = false;

    constructor(private readonly checkpointManager: CheckpointManager) {
        super();
    }

    /**
     * Updates the checkpoint for the partition
     */
    public checkpoint(queuedMessage: IQueuedMessage) {
        if (this.closed) {
            return;
        }

        this.checkpointManager.checkpoint(queuedMessage).catch((error) => {
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

    public get log(): ILogger {
        return winston;
    }

    /**
     * Closes the context
     */
    public close(): void {
        this.closed = true;
    }
}
