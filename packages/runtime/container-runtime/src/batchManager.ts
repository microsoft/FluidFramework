/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IBatchMessage } from "@fluidframework/container-definitions";
import { ContainerRuntimeMessage } from "./containerRuntime";

/**
 * Message type used by BatchManager
 */
export type BatchMessage = IBatchMessage & { localOpMetadata: unknown; deserializedContent: ContainerRuntimeMessage; };

/**
 * Helper class that manages partial batch & rollback.
 */
export class BatchManager {
    private pendingBatch: BatchMessage [] = [];

    public push(message: BatchMessage) {
        this.pendingBatch.push(message);
    }

    public get empty() { return this.pendingBatch.length === 0; }

    public popBatch() {
        const batch = this.pendingBatch;
        this.pendingBatch = [];
        return batch;
    }

    /**
     * Capture the pending state at this point
     */
     public checkpoint() {
        const startPoint = this.pendingBatch.length;
        return {
            rollback: (process: (message: BatchMessage) => void) => {
                for (let i = this.pendingBatch.length; i > startPoint;) {
                    i--;
                    const message = this.pendingBatch[i];
                    process(message);
                }

                this.pendingBatch.length = startPoint;
            },
        };
    }
}
