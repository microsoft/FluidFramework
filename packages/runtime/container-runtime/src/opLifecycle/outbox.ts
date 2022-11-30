/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { IContainerContext } from "@fluidframework/container-definitions";
import { GenericError } from "@fluidframework/container-utils";
import { MessageType } from "@fluidframework/protocol-definitions";
import { ICompressionRuntimeOptions } from "../containerRuntime";
import { PendingStateManager } from "../pendingStateManager";
import { BatchManager } from "./batchManager";
import { BatchMessage, IBatch } from "./definitions";
import { OpCompressor } from "./opCompressor";
import { OpSplitter } from "./opSplitter";

export interface IOutboxConfig {
    readonly compressionOptions?: ICompressionRuntimeOptions;
    readonly maxBatchSizeInBytes: number;
};

export interface IOutboxParameters {
    readonly shouldSend: () => boolean,
    readonly pendingStateManager: PendingStateManager,
    readonly containerContext: IContainerContext,
    readonly config: IOutboxConfig,
    readonly compressor: OpCompressor;
    readonly splitter: OpSplitter;
}

export class Outbox {
    private readonly attachFlowBatch: BatchManager;
    private readonly mainBatch: BatchManager;
    private readonly defaultAttachFlowSoftLimitInBytes = 64 * 1024;

    constructor(private readonly params: IOutboxParameters) {
        // We need to allow infinite size batches if we enable compression
        const hardLimit = this.params.config.compressionOptions?.minimumBatchSizeInBytes !== Infinity
            ? Infinity : this.params.config.maxBatchSizeInBytes;
        const softLimit = this.params.config.compressionOptions?.minimumBatchSizeInBytes !== Infinity
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

    private flushInternal(rawBatch: IBatch) {
        const processedBatch = this.maybeCompressBatch(rawBatch);
        const clientSequenceNumber = this.flushBatch(processedBatch);
        this.persistPendingBatch(clientSequenceNumber, rawBatch.content);
    }

    private maybeCompressBatch(batch: IBatch): IBatch {
        if (batch.content.length === 0
            || this.params.config.compressionOptions === undefined
            || this.params.config.compressionOptions.minimumBatchSizeInBytes >= batch.contentSizeInBytes) {
            // Nothing to do if the batch is empty or if compression is disabled or if we don't need to compress
            return batch;
        }

        const compressedBatch = this.params.compressor.compressBatch(batch);
        if (compressedBatch.contentSizeInBytes < this.params.config.maxBatchSizeInBytes) {
            // If we don't reach the maximum supported size of a batch, it safe to be sent as is
            return compressedBatch;
        }

        return this.params.splitter.splitCompressedBatch(compressedBatch);
    }

    private flushBatch(batch: IBatch): number {
        let clientSequenceNumber: number = -1;
        const length = batch.content.length;

        // Did we disconnect in the middle of turn-based batch?
        // If so, do nothing, as pending state manager will resubmit it correctly on reconnect.
        if (length === 0 || !this.params.shouldSend()) {
            return clientSequenceNumber;
        }

        clientSequenceNumber = this.sendBatch(batch.content);
        // Convert from clientSequenceNumber of last message in the batch to clientSequenceNumber of first message.
        clientSequenceNumber -= length - 1;
        assert(clientSequenceNumber >= 0, 0x3d0 /* clientSequenceNumber can't be negative */);
        return clientSequenceNumber;
    }

    private sendBatch(batch: BatchMessage[]): number {
        if (this.params.containerContext.submitBatchFn === undefined) {
            // Legacy path - supporting old loader versions. Can be removed only when LTS moves above
            // version that has support for batches (submitBatchFn)
            let clientSequenceNumber: number = -1;
            for (const message of batch) {
                // Legacy path doesn't support compressed payloads and will submit uncompressed payload anyways
                if (message.metadata?.compressed) {
                    delete message.metadata.compressed;
                }

                clientSequenceNumber = this.params.containerContext.submitFn(
                    MessageType.Operation,
                    message.deserializedContent,
                    true, // batch
                    message.metadata);
            }

            this.params.containerContext.deltaManager.flush();
            return clientSequenceNumber;
        }

        const batchToSend = batch.map((message) => ({ contents: message.contents, metadata: message.metadata }));
        // returns clientSequenceNumber of last message in a batch
        return this.params.containerContext.submitBatchFn(batchToSend);
    }

    private persistPendingBatch(initialClientSequenceNumber: number, batch: BatchMessage[]) {
        let clientSequenceNumber = initialClientSequenceNumber;
        // Let the PendingStateManager know that a message was submitted.
        // In future, need to shift toward keeping batch as a whole!
        for (const message of batch) {
            this.params.pendingStateManager.onSubmitMessage(
                message.deserializedContent.type,
                clientSequenceNumber,
                message.referenceSequenceNumber,
                message.deserializedContent.contents,
                message.localOpMetadata,
                message.metadata,
            );

            clientSequenceNumber++;
        }

        this.params.pendingStateManager.onFlush();
    }

    public checkpoint() {
        return {
            mainBatch: this.mainBatch.checkpoint(),
            attachFlowBatch: this.attachFlowBatch.checkpoint(),
        };
    }
}
