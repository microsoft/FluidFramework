/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { compress } from "lz4js";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IsoBuffer } from "@fluidframework/common-utils";
import { OpDecompressor } from "../opDecompressor";
import { ContainerMessageType, ContainerRuntimeMessage } from "..";

function generateCompressedBatchMessage(length: number): ISequencedDocumentMessage {
    const batch: ContainerRuntimeMessage[] = [];
    for (let i = 0; i < length; i++) {
        batch.push({ contents: "value", type: ContainerMessageType.FluidDataStoreOp });
    }

    const contentsAsBuffer = new TextEncoder().encode(JSON.stringify(batch));
    const compressedContents = compress(contentsAsBuffer);
    const compressedContent = IsoBuffer.from(compressedContents).toString("base64");

    const messageBase: ISequencedDocumentMessage = {
        contents: { packedContents: compressedContent },
        clientId: "clientId",
        sequenceNumber: 1,
        term: 1,
        minimumSequenceNumber: 1,
        clientSequenceNumber: 1,
        referenceSequenceNumber: 1,
        type: "type",
        timestamp: 1,
    };

    // Single compressed message won't have batch metadata
    if (length === 1) {
        return {
            ...messageBase,
            metadata: { compressed: true },
        };
    }

    return {
        ...messageBase,
        metadata: { compressed: true, batch: true },
    };
}

const emptyMessage: ISequencedDocumentMessage = {
    contents: {},
    clientId: "clientId",
    sequenceNumber: 1,
    term: 1,
    minimumSequenceNumber: 1,
    clientSequenceNumber: 1,
    referenceSequenceNumber: 1,
    type: "type",
    timestamp: 1,
};

const endBatchEmptyMessage: ISequencedDocumentMessage = {
    contents: {},
    metadata: { batch: false },
    clientId: "clientId",
    sequenceNumber: 1,
    term: 1,
    minimumSequenceNumber: 1,
    clientSequenceNumber: 1,
    referenceSequenceNumber: 1,
    type: "type",
    timestamp: 1,
};

describe("OpDecompressor", () => {
    let decompressor: OpDecompressor;
    beforeEach(() => {
        decompressor = new OpDecompressor();
    });

    it("Processes single compressed op", () => {
        const message = decompressor.processMessage(generateCompressedBatchMessage(1));
        assert.strictEqual(message.contents.contents, "value");
    });

    it("Processes multiple compressed ops", () => {
        const rootMessage = generateCompressedBatchMessage(5);
        const firstMessage = decompressor.processMessage(rootMessage);

        assert.strictEqual(firstMessage.contents.contents, "value");

        for (let i = 1; i < 4; i++) {
            const message = decompressor.processMessage(emptyMessage);
            assert.strictEqual(message.contents.contents, "value");
        }

        assert.strictEqual(decompressor.processMessage(endBatchEmptyMessage).contents.contents, "value");
    });

    it("Processes multiple batches of compressed ops", () => {
        const rootMessage = generateCompressedBatchMessage(5);
        const firstMessage = decompressor.processMessage(rootMessage);

        assert.strictEqual(firstMessage.contents.contents, "value");

        for (let i = 1; i < 4; i++) {
            const message = decompressor.processMessage(emptyMessage);
            assert.strictEqual(message.contents.contents, "value");
        }

        assert.strictEqual(decompressor.processMessage(endBatchEmptyMessage).contents.contents, "value");

        const nextRootMessage = generateCompressedBatchMessage(3);
        const nextFirstMessage = decompressor.processMessage(nextRootMessage);

        assert.strictEqual(nextFirstMessage.contents.contents, "value");

        for (let i = 1; i < 2; i++) {
            const message = decompressor.processMessage(emptyMessage);
            assert.strictEqual(message.contents.contents, "value");
        }

        assert.strictEqual(decompressor.processMessage(endBatchEmptyMessage).contents.contents, "value");
    });
});
