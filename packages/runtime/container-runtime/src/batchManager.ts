/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { IBatchMessage } from "@fluidframework/container-definitions";
import { GenericError } from "@fluidframework/container-utils";
import { MonitoringContext } from "@fluidframework/telemetry-utils";
import { ContainerRuntimeMessage, ICompressionRuntimeOptions } from "./containerRuntime";
import { OpCompressor } from "./opCompressor";

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
    private readonly opCompressor: OpCompressor;
    private pendingBatch: BatchMessage [] = [];
    private batchContentSize = 0;

    public get length() { return this.pendingBatch.length; }
    public get limit() { return this.hardLimit; }

    constructor(
        private readonly mc: MonitoringContext,
        private readonly hardLimit: number,
        public readonly softLimit?: number,
        private readonly compressionOptions?: ICompressionRuntimeOptions,
    ) {
        this.opCompressor = new OpCompressor(mc.logger);
    }

    public push(message: BatchMessage): boolean {
        this.checkReferenceSequenceNumber(message);

        const contentSize = this.batchContentSize + (message.contents?.length ?? 0);
        const opCount = this.pendingBatch.length;

        // Attempt to estimate batch size, aka socket message size.
        // Each op has pretty large envelope, estimating to be 200 bytes.
        // Also content will be strigified, and that adds a lot of overhead due to a lot of escape characters.
        // Not taking it into account, as compression work should help there - compressed payload will be
        // initially stored as base64, and that requires only 2 extra escape characters.
        const socketMessageSize = contentSize + 200 * opCount;

        // If we were provided soft limit, check for exceeding it.
        // But only if we have any ops, as the intention here is to flush existing ops (on exceeding this limit)
        // and start over. That's not an option if we have no ops.
        if (this.softLimit !== undefined && this.length > 0 && socketMessageSize >= this.softLimit) {
            return false;
        }

        if (socketMessageSize >= this.limit) {
            return false;
        }

        this.batchContentSize = contentSize;
        this.pendingBatch.push(message);
        return true;
    }

    public get empty() { return this.pendingBatch.length === 0; }

    public popBatch() {
        const batch = this.pendingBatch;
        const size = this.batchContentSize;
        this.pendingBatch = [];
        this.batchContentSize = 0;

        if (batch.length > 0
            && this.compressionOptions !== undefined
            && this.compressionOptions.minimumBatchSize < size) {
            return this.opCompressor.compressBatch(batch, size);
        }

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
                    this.batchContentSize -= message.contents?.length ?? 0;
                    process(message);
                }

                this.pendingBatch.length = startPoint;
            },
        };
    }

    private checkReferenceSequenceNumber(message: BatchMessage) {
        if (this.mc.config.getBoolean("Fluid.ContainerRuntime.DisableOpReentryCheck") !== true
            && this.pendingBatch.length > 0
            && message.referenceSequenceNumber !== this.pendingBatch[0].referenceSequenceNumber) {
            throw new GenericError(
                "Submission of an out of order message",
                /* error */ undefined,
                {
                    referenceSequenceNumber: this.pendingBatch[0].referenceSequenceNumber,
                    messageReferenceSequenceNumber: message.referenceSequenceNumber,
                });
        }
    }
}
