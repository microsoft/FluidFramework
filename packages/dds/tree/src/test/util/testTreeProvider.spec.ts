/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "assert";
import { SharedTreeCore } from "../../shared-tree-core";
import { spyOnMethod, TestTreeProvider } from "../utils";

describe("TestTreeProvider", () => {
    it("can manually trigger summaries with summarizeOnDemand", async () => {
        let summaryCount = 0;
        const unspy = spyOnMethod(SharedTreeCore, "summarizeCore", () => {
            summaryCount += 1;
        });

        const provider = await TestTreeProvider.create(1, true);
        const summaries = summaryCount;
        await provider.manualSummarize();

        assert(summaryCount === summaries + 1);
        unspy();
    });

    it("cannot manually trigger summaries without setting summarizeOnDemand", async () => {
        let summaryCount = 0;
        const unspy = spyOnMethod(SharedTreeCore, "summarizeCore", () => {
            summaryCount += 1;
        });

        const provider = await TestTreeProvider.create(1);
        const summaries = summaryCount;
        await provider.manualSummarize();
        assert(summaryCount !== summaries + 1);
        unspy();
    });

    it("cannot trigger summaries with multiple trees", async () => {
        let summaryCount = 0;
        const unspy = spyOnMethod(SharedTreeCore, "summarizeCore", () => {
            summaryCount += 1;
        });

        const provider = await TestTreeProvider.create(2, true);

        const summaries = summaryCount;
        await provider.manualSummarize();
        assert(summaryCount !== summaries + 1);
        unspy();
    });

});
