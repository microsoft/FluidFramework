/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { createSummarizer, summarizeNow } from "@fluidframework/test-utils";
import { countEvent, getSharedObjectSummary, TestStackProvider } from "./utils";

describe("SharedStack", () => {
    it("reports emptiness", async () => {
        const provider = await TestStackProvider.create<string>(1);
        assert(provider.stacks[0].isEmpty());
        await provider.stacks[0].push("element");
        assert(!provider.stacks[0].isEmpty());
        await provider.stacks[0].pop();
        assert(provider.stacks[0].isEmpty());
    });

    it("stores elements", async () => {
        const provider = await TestStackProvider.create<string>(1);
        await provider.stacks[0].push("first");
        await provider.stacks[0].push("second");
        const second = await provider.stacks[0].pop();
        const first = await provider.stacks[0].pop();
        assert.equal(second, "second");
        assert.equal(first, "first");
    });

    it("sends and receives ops", async () => {
        const provider = await TestStackProvider.create<string>(2);
        await provider.stacks[0].push("element");
        await provider.ensureSynchronized();
        assert.equal(await provider.stacks[1].pop(), "element");
        await provider.ensureSynchronized();
        assert(provider.stacks[0].isEmpty());
    });

    it("is virtualized", async () => {
        // Clients should only download the blobs that they need to read
        const provider = await TestStackProvider.create<string>(2);
        const downloadCounter0 = countEvent(provider.stacks[0], "downloadedBlob");
        const downloadCounter1 = countEvent(provider.stacks[1], "downloadedBlob");
        await provider.stacks[0].push("first");
        await provider.stacks[0].push("second");
        await provider.ensureSynchronized();
        assert.equal(await provider.stacks[1].pop(), "second");
        assert.equal(downloadCounter1.count, 1);
        assert.equal(await provider.stacks[1].pop(), "first");
        assert.equal(downloadCounter1.count, 2);
        await provider.ensureSynchronized();
        assert.equal(downloadCounter0.count, 0);
        downloadCounter0.dispose();
        downloadCounter1.dispose();
    });

    it("is incremental", async () => {
        // Clients should only update the blobs that they have changed
        const provider = await TestStackProvider.create<string>(2);
        const uploadCounter0 = countEvent(provider.stacks[0], "uploadedBlob");
        const uploadCounter1 = countEvent(provider.stacks[1], "uploadedBlob");
        await provider.stacks[0].push("first");
        await provider.stacks[0].push("second");
        assert.equal(uploadCounter0.count, 2);
        assert.equal(uploadCounter1.count, 0);
        await provider.stacks[1].push("third");
        assert.equal(uploadCounter1.count, 1);
        await provider.stacks[1].push("fourth");
        assert.equal(uploadCounter1.count, 2);
        uploadCounter0.dispose();
        uploadCounter1.dispose();
    });

    it("summarizes", async () => {
        const provider = await TestStackProvider.create<string>(1);
        await provider.stacks[0].push("element");
        const summarizer = await createSummarizer(provider, provider.containers[0]);
        await provider.ensureSynchronized();
        const { summaryTree } = await summarizeNow(summarizer, "SharedStack test");
        const stackSummary = getSharedObjectSummary(summaryTree, provider.stacks[0]);
        assert.notEqual(stackSummary?.tree.head, undefined);
    });

    it("is consistent across summaries", async () => {
        // A client should load the current state correctly when joining after another client has summarized
        const provider = await TestStackProvider.create<string>(1);
        await provider.stacks[0].push("first");
        await provider.stacks[0].push("second");
        const summarizer = await createSummarizer(provider, provider.containers[0]);
        await provider.ensureSynchronized();
        await summarizeNow(summarizer, "SharedStack test");
        await provider.createStack();
        const opCounter = countEvent(provider.stacks[1], "processedOp");
        await provider.stacks[1].push("third");
        assert(await provider.stacks[1].pop(), "third");
        assert(await provider.stacks[1].pop(), "second");
        assert(await provider.stacks[1].pop(), "first");
        await provider.ensureSynchronized();
        assert.equal(opCounter.count, 4); // Client 1 should receive acks for all ops after summary, but no ops from before
        opCounter.dispose();
    });
});
