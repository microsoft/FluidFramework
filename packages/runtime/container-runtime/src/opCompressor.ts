/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { IsoBuffer } from "@fluidframework/common-utils";
import { compress } from "lz4js";
import { BatchMessage } from "./batchManager";
import { CompressionAlgorithms, ContainerRuntimeMessage } from "./containerRuntime";

/**
 * Compresses batches of ops. It generates a single compressed op that contains
 * the contents of each op in the batch. It then submits empty ops for each original
 * op to reserve sequence numbers.
 */
export class OpCompressor {
    private compressedBatchCount = 0;

    constructor(private readonly logger: ITelemetryLogger) {}

    public compressBatch(batch: BatchMessage[], originalLength: number): BatchMessage[] {
        const batchToSend: BatchMessage[] = [];
        this.compressedBatchCount++;
        const batchedContents: ContainerRuntimeMessage[] = [];
        console.error(batch);
        for (const message of batch) {
            batchedContents.push(message.deserializedContent);
        }

        const compressionStart = Date.now();
        const contentsAsBuffer = new TextEncoder().encode(JSON.stringify(batchedContents));
        const compressedContents = compress(contentsAsBuffer);
        const compressedContent = IsoBuffer.from(compressedContents).toString("base64");
        const duration = Date.now() - compressionStart;

        if (originalLength > 200000 || this.compressedBatchCount % 100) {
            this.logger.sendPerformanceEvent({
                eventName: "CompressedBatch",
                duration,
                sizeBeforeCompression: originalLength,
                sizeAfterCompression: compressedContent.length,
            });
        }

        batchToSend.push({ ...batch[0], contents: JSON.stringify({ packedContents: compressedContent }),
                           metadata: { ...batch[0].metadata, compressed: true },
                           compression: CompressionAlgorithms.lz4 });

        for (let i = 1; i < batch.length; i++) {
            batchToSend.push({ ...batch[i], contents: undefined, metadata: batch[i].metadata });
        }

        console.error(batchToSend);

        return batchToSend;
    }
}
