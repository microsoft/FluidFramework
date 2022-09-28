/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { BatchManager, BatchMessage } from "../batchManager";

describe("BatchManager", () => {
    beforeEach(() => {
    });

    const softLimit = 1024;

    const generateStringOfSize = (sizeInBytes: number): string => new Array(sizeInBytes + 1).join("0");

    const smallMessage = { contents: generateStringOfSize(10) } as any as BatchMessage;

    it("BatchManager's soft limit: a bunch of small messages", () => {
        const message = { contents: generateStringOfSize(softLimit / 2) } as any as BatchMessage;
        const batchManager = new BatchManager(softLimit);

        // Can push one large message
        assert.equal(batchManager.push(message), true);
        assert.equal(batchManager.length, 1);

        // Can't push another large message
        assert.equal(batchManager.push(message), false);
        assert.equal(batchManager.length, 1);

        // But can push one small message
        assert.equal(batchManager.push(smallMessage), true);
        assert.equal(batchManager.length, 2);

        // Pop and check batch
        const batch = batchManager.popBatch();
        assert.equal(batch.length, 2);

        // Validate that can push large message again
        assert.equal(batchManager.push(message), true);
        assert.equal(batchManager.length, 1);

        assert.equal(batchManager.push(message), false);
        assert.equal(batchManager.length, 1);
    });

    it("BatchManager's soft limit: single large message", () => {
        const message = { contents: generateStringOfSize(softLimit * 2) } as any as BatchMessage;
        const batchManager = new BatchManager(softLimit);

        // Can push one large message, even above soft limit
        assert.equal(batchManager.push(message), true);
        assert.equal(batchManager.length, 1);

        // Can't push another small message
        assert.equal(batchManager.push(smallMessage), false);
        assert.equal(batchManager.length, 1);

        // Pop and check batch
        const batch = batchManager.popBatch();
        assert.equal(batch.length, 1);

        // Validate that we can't push large message above soft limit if we have already at least one message.
        assert.equal(batchManager.push(smallMessage), true);
        assert.equal(batchManager.length, 1);

        assert.equal(batchManager.push(message), false);
        assert.equal(batchManager.length, 1);
    });

    it("BatchManager: no soft limit", () => {
        const batchManager = new BatchManager();
        const third = Math.floor(batchManager.limit / 3) + 1;
        const message = { contents: generateStringOfSize(third) } as any as BatchMessage;

        // Can push one large message, even above soft limit
        assert.equal(batchManager.push(message), true);
        assert.equal(batchManager.length, 1);

        // Can push second large message, even above soft limit
        assert.equal(batchManager.push(message), true);
        assert.equal(batchManager.length, 2);

        // Can't push another message
        assert.equal(batchManager.push(message), false);
        assert.equal(batchManager.length, 2);

        // Pop and check batch
        const batch = batchManager.popBatch();
        assert.equal(batch.length, 2);

        // Can push messages again
        assert.equal(batchManager.push(message), true);
        assert.equal(batchManager.length, 1);

        assert.equal(batchManager.push(message), true);
        assert.equal(batchManager.length, 2);

        assert.equal(batchManager.push(smallMessage), true);
        assert.equal(batchManager.length, 3);
    });

    it("BatchManager: soft limit is higher than hard limit", () => {
        const batchManager = new BatchManager(BatchManager.limit * 2);
        const twoThird = Math.floor(batchManager.limit * 2 / 3);
        const message = { contents: generateStringOfSize(twoThird) } as any as BatchMessage;
        const largeMessage = { contents: generateStringOfSize(batchManager.limit + 1) } as any as BatchMessage;

        // Can't push very large message, above hard limit
        assert.equal(batchManager.push(largeMessage), false);
        assert.equal(batchManager.length, 0);

        // Can push one message
        assert.equal(batchManager.push(message), true);
        assert.equal(batchManager.length, 1);

        // Can't push second message
        assert.equal(batchManager.push(message), false);
        assert.equal(batchManager.length, 1);

        // Pop and check batch
        const batch = batchManager.popBatch();
        assert.equal(batch.length, 1);
    });
});
