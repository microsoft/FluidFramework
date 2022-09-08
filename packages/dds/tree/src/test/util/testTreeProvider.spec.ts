/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { SharedTreeCore } from "../../shared-tree-core";
import { spyOnMethod, TestTreeProvider } from "../utils";

describe("TestTreeProvider", () => {
    it("can manually trigger summaries", async () => {
        let summaryCount = 0;

        const unspy = spyOnMethod(SharedTreeCore, "summarizeCore", () => {
            summaryCount += 1;
        });

        const provider = await TestTreeProvider.create(1);
        const summarize = await provider.enableManualSummarization();
        const summaries = summaryCount;
        await summarize();
        assert.equal(summaryCount, summaries + 1);
        unspy();
    });
});
