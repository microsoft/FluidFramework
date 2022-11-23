/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { compress } from "lz4js";
import { ISequencedDocumentMessage } from "@fluidframework/protocol-definitions";
import { IsoBuffer } from "@fluidframework/common-utils";
import { ContainerRuntimeMessage, ContainerMessageType } from "../..";
import { OpDecompressor } from "../../opLifecycle";

function generateCompressedBatchMessage(length: number, metadata = true): ISequencedDocumentMessage {
    const batch: ContainerRuntimeMessage[] = [];
    for (let i = 0; i < length; i++) {
        batch.push({ contents: `value${i}`, type: ContainerMessageType.FluidDataStoreOp });
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
        compression: "lz4",
    };

    let opMetadata;
    if (metadata) {
        opMetadata = { compressed: true };
    }

    // Single compressed message won't have batch metadata
    if (length === 1) {
        return {
            ...messageBase,
            metadata: opMetadata,
        };
    }

    return {
        ...messageBase,
        metadata: { ...opMetadata, batch: true },
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
        const result = decompressor.processRemoteMessage(generateCompressedBatchMessage(1));
        assert.strictEqual(result.state, "Processed");
        assert.strictEqual(result.message.contents.contents, "value0");
    });

    it("Processes multiple compressed ops", () => {
        const rootMessage = generateCompressedBatchMessage(5);
        const firstMessageResult = decompressor.processRemoteMessage(rootMessage);

        assert.strictEqual(firstMessageResult.state, "Processed");
        assert.strictEqual(firstMessageResult.message.contents.contents, "value0");

        for (let i = 1; i < 4; i++) {
            const messageResult = decompressor.processRemoteMessage(emptyMessage);
            assert.strictEqual(messageResult.state, "Processed");
            assert.strictEqual(messageResult.message.contents.contents, `value${i}`);
        }

        const lastMessageResult = decompressor.processRemoteMessage(endBatchEmptyMessage);
        assert.strictEqual(lastMessageResult.state, "Processed");
        assert.strictEqual(lastMessageResult.message.contents.contents, "value4");
    });

    it("Processes multiple batches of compressed ops", () => {
        const rootMessage = generateCompressedBatchMessage(5);
        const firstMessage = decompressor.processRemoteMessage(rootMessage).message;

        assert.strictEqual(firstMessage.contents.contents, "value0");

        for (let i = 1; i < 4; i++) {
            const message = decompressor.processRemoteMessage(emptyMessage).message;
            assert.strictEqual(message.contents.contents, `value${i}`);
        }

        assert.strictEqual(decompressor.processRemoteMessage(endBatchEmptyMessage).message.contents.contents, "value4");

        const nextRootMessage = generateCompressedBatchMessage(3);
        const nextFirstMessage = decompressor.processRemoteMessage(nextRootMessage).message;

        assert.strictEqual(nextFirstMessage.contents.contents, "value0");

        const middleMessage = decompressor.processRemoteMessage(emptyMessage).message;
        assert.strictEqual(middleMessage.contents.contents, "value1");

        assert.strictEqual(decompressor.processRemoteMessage(endBatchEmptyMessage).message.contents.contents, "value2");
    });

    it("Processes single compressed op wth only protocol property", () => {
        const rootMessage = generateCompressedBatchMessage(5, false);
        const firstMessage = decompressor.processRemoteMessage(rootMessage).message;

        assert.strictEqual(firstMessage.contents.contents, "value0");
    });
});
