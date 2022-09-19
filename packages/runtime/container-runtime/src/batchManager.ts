/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IBatchMessage } from "@fluidframework/container-definitions";
import { GenericError } from "@fluidframework/container-utils";
import { ContainerRuntimeMessage } from "./containerRuntime";

/**
 * Message type used by BatchManager
 */
export type BatchMessage = IBatchMessage & {
    localOpMetadata: unknown;
    deserializedContent: ContainerRuntimeMessage;
    referenceSequenceNumber: number;
};

/**
 * Helper class that manages partial batch & rollback.
 */
export class BatchManager {
    private pendingBatch: BatchMessage [] = [];
    private batchContentSize = 0;

    // The actual limit is 1Mb (socket.io and Kafka limits)
    // We can't estimate it fully, as we
    // - do not know what properties relay service will add
    // - we do not stringify final op, thus we do not know how much escaping will be added.
    private static readonly defaultMaxOpSizeInBytes = 950 * 1024;

    public push(message: BatchMessage) {
        this.pendingBatch.push(message);
        this.batchContentSize += message.contents.length;

        const opCount = this.pendingBatch.length;
        const limit = BatchManager.defaultMaxOpSizeInBytes;

        // Attempt to estimate batch size, aka socket message size.
        // Each op has pretty large envelope, estimating to be 200 bytes.
        // Also content will be strigified, and that adds a lot of overhead due to a lot of escape characters.
        // Not taking it into account, as compression work should help there - compressed payload will be
        // initially stored as base64, and that requires only 2 extra escape characters.
        const socketMessageSize = this.batchContentSize + 200 * opCount;

        if (socketMessageSize >= limit) {
            // If the content length is larger than the client configured message size
            // instead of splitting the content, we will fail by explicitly closing the container
            throw new GenericError(
                "BatchTooLarge",
                /* error */ undefined,
                {
                    opSize: message.contents.length,
                    batchContentSize: this.batchContentSize,
                    count: opCount,
                    limit,
                });
        }
    }

    public get empty() { return this.pendingBatch.length === 0; }

    public popBatch() {
        const batch = this.pendingBatch;
        this.pendingBatch = [];
        this.batchContentSize = 0;
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
                    this.batchContentSize -= message.contents.length;
                    process(message);
                }

                this.pendingBatch.length = startPoint;
            },
        };
    }
}
