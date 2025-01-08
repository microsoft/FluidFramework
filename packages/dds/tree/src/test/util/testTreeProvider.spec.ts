/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import assert from "node:assert";

import { SharedTreeCore } from "../../shared-tree-core/index.js";
import { SummarizeType, TestTreeProvider, spyOnMethod } from "../utils.js";

describe("TestTreeProvider", () => {
	it("can manually trigger summaries with summarizeOnDemand", async () => {
		let summaryCount = 0;
		const unspy = spyOnMethod(SharedTreeCore, "summarizeCore", () => {
			summaryCount += 1;
		});

		const provider = await TestTreeProvider.create(1, SummarizeType.onDemand);
		const summaries = summaryCount;
		await provider.summarize();

		// summarizeCore is invoked as part of getGCData, hence why this is +2 and not +1
		assert.strictEqual(summaryCount, summaries + 2);
		unspy();
	});

	it("cannot manually trigger summaries without setting summarizeOnDemand", async () => {
		let summarizerError;
		try {
			const provider = await TestTreeProvider.create(1);
			await provider.summarize();
		} catch (error) {
			summarizerError = error;
		}
		assert.notStrictEqual(summarizerError, undefined);
	});

	it("cannot manually trigger summaries with 0 trees", async () => {
		let summarizerError;
		try {
			const provider = await TestTreeProvider.create(0, SummarizeType.onDemand);
			await provider.summarize();
		} catch (error) {
			summarizerError = error;
		}
		assert.notStrictEqual(summarizerError, undefined);
	});

	it("can trigger summaries with multiple trees", async () => {
		let summaryCount = 0;
		const unspy = spyOnMethod(SharedTreeCore, "summarizeCore", () => {
			summaryCount += 1;
		});

		const provider = await TestTreeProvider.create(2, SummarizeType.onDemand);

		const summaries = summaryCount;
		await provider.summarize();

		// summarizeCore is invoked as part of getGCData, hence why this is +2 and not +1
		assert.strictEqual(summaryCount, summaries + 2);
		unspy();
	});
});
