/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { IContainerContext } from "@fluidframework/container-definitions";
import { GenericError } from "@fluidframework/container-utils";
import { MessageType } from "@fluidframework/protocol-definitions";
import { BatchManager, BatchMessage, IBatch } from "../batchManager";
import { ICompressionRuntimeOptions } from "../containerRuntime";
import { PendingStateManager } from "../pendingStateManager";

export interface IOutboxOptions {
    readonly compressionOptions?: ICompressionRuntimeOptions;
    readonly enableOpReentryCheck?: boolean;
    readonly maxBatchSizeInBytes: number;
};

export interface IBatchProcessor {
    processOutgoing(batch: IBatch): IBatch;
}

export interface IBatchProcessors {
    readonly compressor: IBatchProcessor;
}

export class Outbox {
    private readonly attachFlowBatch: BatchManager;
    private readonly mainBatch: BatchManager;
    private readonly defaultAttachFlowSoftLimitInBytes = 64 * 1024;

    constructor(
        private readonly shouldSend: () => boolean,
        private readonly pendingStateManager: PendingStateManager,
        private readonly context: IContainerContext,
        private readonly options: IOutboxOptions,
        private readonly batchProcessors: IBatchProcessors,
    ) {
        // We need to allow infinite size batches if we enable compression
        const hardLimit = this.options.compressionOptions?.minimumBatchSizeInBytes !== Infinity
            ? Infinity : this.options.maxBatchSizeInBytes;
        const softLimit = this.options.compressionOptions?.minimumBatchSizeInBytes !== Infinity
            ? Infinity : this.defaultAttachFlowSoftLimitInBytes;

        this.attachFlowBatch = new BatchManager({
            hardLimit,
            softLimit,
        });
        this.mainBatch = new BatchManager({
            hardLimit
        });
    }

    public get isEmpty(): boolean {
        return this.attachFlowBatch.length === 0 && this.mainBatch.length === 0;
    }

    public submit(message: BatchMessage) {
        if (!this.mainBatch.push(message)) {
            throw new GenericError(
                "BatchTooLarge",
                /* error */ undefined,
                {
                    opSize: (message.contents?.length) ?? 0,
                    count: this.mainBatch.length,
                    limit: this.mainBatch.options.hardLimit,
                });
        }
    }

    public submitAttach(message: BatchMessage) {
        if (!this.attachFlowBatch.push(message)) {
            // BatchManager has two limits - soft limit & hard limit. Soft limit is only engaged
            // when queue is not empty.
            // Flush queue & retry. Failure on retry would mean - single message is bigger than hard limit
            this.flushInternal(this.attachFlowBatch.popBatch());
            if (!this.attachFlowBatch.push(message)) {
                throw new GenericError(
                    "BatchTooLarge",
                    /* error */ undefined,
                    {
                        opSize: (message.contents?.length) ?? 0,
                        count: this.attachFlowBatch.length,
                        limit: this.attachFlowBatch.options.hardLimit,
                    });
            }
        }
    }

    public flush() {
        this.flushInternal(this.attachFlowBatch.popBatch());
        this.flushInternal(this.mainBatch.popBatch());
    }

    private flushInternal(batch: IBatch) {
        this.flushBatch(this.prepareBatch(batch));
    }

    private addBatchMetadataToBatch(batch: IBatch): IBatch {
        if (batch.content.length > 1) {
            batch.content[0].metadata = {
                ...batch.content[0].metadata,
                batch: true
            };
            batch.content[batch.content.length - 1].metadata = {
                ...batch.content[batch.content.length - 1].metadata,
                batch: false
            };
        }

        return batch;
    }

    private prepareBatch(batch: IBatch): IBatch {
        if (batch.content.length === 0) {
            return batch;
        }

        let processedBatch = batch;
        if (this.options.compressionOptions !== undefined
            && this.options.compressionOptions.minimumBatchSizeInBytes < batch.contentSizeInBytes) {
            processedBatch = this.batchProcessors.compressor.processOutgoing(batch);
        }

        return this.addBatchMetadataToBatch(processedBatch);
    }

    private flushBatch(batch: IBatch): void {
        const length = batch.content.length;

        if (length === 0) {
            return;
        }

        let clientSequenceNumber: number = -1;

        // Did we disconnect in the middle of turn-based batch?
        // If so, do nothing, as pending state manager will resubmit it correctly on reconnect.
        if (this.shouldSend()) {
            clientSequenceNumber = this.sendBatch(batch.content);

            // Convert from clientSequenceNumber of last message in the batch to clientSequenceNumber of first message.
            clientSequenceNumber -= length - 1;
            assert(clientSequenceNumber >= 0, 0x3d0 /* clientSequenceNumber can't be negative */);
        }

        this.persistPendingBatch(clientSequenceNumber, batch.content);
    }

    private sendBatch(batch: BatchMessage[]): number {
        if (this.context.submitBatchFn === undefined) {
            // Legacy path - supporting old loader versions. Can be removed only when LTS moves above
            // version that has support for batches (submitBatchFn)
            let clientSequenceNumber: number = -1;
            for (const message of batch) {
                // Legacy path doesn't support compressed payloads and will submit uncompressed payload anyways
                if (message.metadata?.compressed) {
                    delete message.metadata.compressed;
                }

                clientSequenceNumber = this.context.submitFn(
                    MessageType.Operation,
                    message.deserializedContent,
                    true, // batch
                    message.metadata);
            }

            this.context.deltaManager.flush();
            return clientSequenceNumber;
        }

        const batchToSend = batch.map((message) => ({ contents: message.contents, metadata: message.metadata }));
        // returns clientSequenceNumber of last message in a batch
        return this.context.submitBatchFn(batchToSend);
    }

    private persistPendingBatch(initialClientSequenceNumber: number, batch: BatchMessage[]) {
        let clientSequenceNumber = initialClientSequenceNumber;
        // Let the PendingStateManager know that a message was submitted.
        // In future, need to shift toward keeping batch as a whole!
        for (const message of batch) {
            this.pendingStateManager.onSubmitMessage(
                message.deserializedContent.type,
                clientSequenceNumber,
                message.referenceSequenceNumber,
                message.deserializedContent.contents,
                message.localOpMetadata,
                message.metadata,
            );

            clientSequenceNumber++;
        }

        this.pendingStateManager.onFlush();
    }

    public checkpoint() {
        return {
            mainBatch: this.mainBatch.checkpoint(),
            attachFlowBatch: this.attachFlowBatch.checkpoint(),
        };
    }
}
