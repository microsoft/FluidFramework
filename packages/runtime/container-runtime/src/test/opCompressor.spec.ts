/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { TelemetryUTLogger } from "@fluidframework/telemetry-utils";
import { ContainerMessageType } from "..";
import { BatchMessage, IBatch } from "../batchManager";
import { OpCompressor } from "../opCompressor";

describe("OpCompressor", () => {
    let compressor: OpCompressor;
    beforeEach(() => {
        compressor = new OpCompressor(new TelemetryUTLogger());
    });

    const messagesToBatch = (messages: BatchMessage[]): IBatch => ({
        content: messages,
        contentSizeInBytes: messages.map((message) => JSON.stringify(message).length).reduce((a, b) => a + b),
    });

    it("Compresses single op batch", () => {
        const compressedBatch = compressor.processOutgoing(messagesToBatch([
            {
                metadata: undefined,
                localOpMetadata: undefined,
                deserializedContent: {
                    contents: "content",
                    type: ContainerMessageType.FluidDataStoreOp
                },
                referenceSequenceNumber: 0
            }
        ]));
        assert.strictEqual(compressedBatch.content.length, 1);
        assert.strictEqual(compressedBatch.content[0].compression, "lz4");
        assert.strictEqual(compressedBatch.content[0].metadata?.compressed, true);
    });

    it("Compresses batch of multiple ops", () => {
        const compressedBatch = compressor.processOutgoing(messagesToBatch([{
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
        }]));
        assert.strictEqual(compressedBatch.content.length, 2);
        assert.strictEqual(compressedBatch.content[0].compression, "lz4");
        assert.strictEqual(compressedBatch.content[0].metadata?.compressed, true);
        assert.strictEqual(compressedBatch.content[1].contents, undefined);
        assert.strictEqual(compressedBatch.content[1].compression, undefined);
    });
});
