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

export interface IBatchManagerOptions {
    readonly enableOpReentryCheck?: boolean;
    readonly hardLimit: number;
    readonly softLimit?: number;
}

/**
 * Helper class that manages partial batch & rollback.
 */
export class BatchManager {
    private pendingBatch: BatchMessage[] = [];
    private batchContentSize = 0;

    public get length() { return this.pendingBatch.length; }
    public get limit() { return this.options.hardLimit; }

    constructor(private readonly options: IBatchManagerOptions) { }

    public push(message: BatchMessage): boolean {
        this.checkReferenceSequenceNumber(message);

        const contentSize = this.batchContentSize + message.contents.length;
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
        if (this.options.softLimit !== undefined && this.length > 0 && socketMessageSize >= this.options.softLimit) {
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

    private checkReferenceSequenceNumber(message: BatchMessage) {
        if (this.options.enableOpReentryCheck === true
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
