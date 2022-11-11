/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TelemetryUTLogger } from "@fluidframework/telemetry-utils";
import { ContainerMessageType } from "..";
import { BatchMessage } from "../batchManager";
import { OpCompressor } from "../opCompressor";

describe("OpCompressor", () => {
    let compressor: OpCompressor;
    beforeEach(() => {
        compressor = new OpCompressor(new TelemetryUTLogger());
    });

    it("Compresses single op batch", () => {
        const batch: BatchMessage[] = [{
            metadata: undefined,
            localOpMetadata: undefined,
            deserializedContent: {
                contents: "content",
                type: ContainerMessageType.FluidDataStoreOp
            },
            referenceSequenceNumber: 0
        }];

        const compressedBatch = compressor.compressBatch(batch, JSON.stringify(batch).length);
        assert.strictEqual(compressedBatch.length, 1);
        assert.strictEqual(compressedBatch[0].compression, "lz4");
        assert.strictEqual(compressedBatch[0].metadata?.compressed, true);
    });

    it("Compresses batch of multiple ops", () => {
        const batch: BatchMessage[] = [{
            metadata: undefined,
            localOpMetadata: undefined,
            deserializedContent: {
                contents: "content",
                type: ContainerMessageType.FluidDataStoreOp
            },
            referenceSequenceNumber: 0
        },
        {
            metadata: undefined,
            localOpMetadata: undefined,
            deserializedContent: {
                contents: "content",
                type: ContainerMessageType.FluidDataStoreOp
            },
            referenceSequenceNumber: 1
        }];

        const compressedBatch = compressor.compressBatch(batch, JSON.stringify(batch).length);
        assert.strictEqual(compressedBatch.length, 2);
        assert.strictEqual(compressedBatch[0].compression, "lz4");
        assert.strictEqual(compressedBatch[0].metadata?.compressed, true);
        assert.strictEqual(compressedBatch[1].contents, undefined);
        assert.strictEqual(compressedBatch[1].compression, undefined);
    });
});
