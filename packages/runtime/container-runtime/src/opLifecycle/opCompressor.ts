/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ITelemetryLogger } from "@fluidframework/common-definitions";
import { IsoBuffer } from "@fluidframework/common-utils";
import { ChildLogger } from "@fluidframework/telemetry-utils";
import { compress } from "lz4js";
import { CompressionAlgorithms, ContainerRuntimeMessage } from "../containerRuntime";
import { IBatch, BatchMessage } from "./definitions";

/**
 * Compresses batches of ops. It generates a single compressed op that contains
 * the contents of each op in the batch. It then submits empty ops for each original
 * op to reserve sequence numbers.
 */
export class OpCompressor {
    private readonly logger;

    constructor(logger: ITelemetryLogger) {
        this.logger = ChildLogger.create(logger, "OpCompressor");
    }

    public compressBatch(batch: IBatch): IBatch {
        const messages: BatchMessage[] = [];
        const contentToCompress: ContainerRuntimeMessage[] = [];
        for (const message of batch.content) {
            contentToCompress.push(message.deserializedContent);
        }

        const compressionStart = Date.now();
        const contentsAsBuffer = new TextEncoder().encode(JSON.stringify(contentToCompress));
        const compressedContents = compress(contentsAsBuffer);
        const compressedContent = IsoBuffer.from(compressedContents).toString("base64");
        const duration = Date.now() - compressionStart;

        if (batch.contentSizeInBytes > 200000) {
            this.logger.sendPerformanceEvent({
                eventName: "CompressedBatch",
                duration,
                sizeBeforeCompression: batch.contentSizeInBytes,
                sizeAfterCompression: compressedContent.length,
            });
        }

        messages.push({
            ...batch.content[0], contents: JSON.stringify({ packedContents: compressedContent }),
            metadata: { ...batch.content[0].metadata, compressed: true },
            compression: CompressionAlgorithms.lz4,
        });

        for (const message of batch.content.slice(1)) {
            messages.push({ ...message, contents: undefined });
        }

        return {
            contentSizeInBytes: compressedContent.length,
            content: messages,
        };
    }
}
