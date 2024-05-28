/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { takeAsync } from "@fluid-private/stochastic-test-utils";

import { baseModel, summarizerOperationGenerator } from "./fuzzUtils.js";
import { createSummarizerFuzzSuite } from "./summarizerFuzzSuite.js";

/**
 * Summarizer fuzz test should test that we eventually recover and send a summary successfully.
 * For DDS, we test for eventual consistency. For summarizer, we could test for eventual recovery.
 * After performing operations (i.e. disconnects, summaryNacks, ops from other clients, etc.) we should:
 * - start a fresh summarizer
 * - attempt a summary
 * If the system doesn't recover properly, then we have a bug to fix.
 */

describe("Summarizer fuzz testing", () => {
	const model = {
		...baseModel,
		workloadName: "summarizer",
		generatorFactory: () =>
			takeAsync(
				1000,
				summarizerOperationGenerator({
					weights: {
						reconnect: 1,
						newSummarizer: 1,
						summaryNack: 1,
						submitOp: 1,
					},
				}),
			),
	};

	createSummarizerFuzzSuite(model, {
		defaultTestCount: 25,
	});
});
