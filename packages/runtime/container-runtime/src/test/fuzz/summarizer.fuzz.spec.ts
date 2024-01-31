/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { take } from "@fluid-private/stochastic-test-utils";
import { createSummarizerFuzzSuite, operationGenerator, baseModel } from "./fuzzUtils";

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
			take(
				1,
				operationGenerator({
					weights: {
						disconnect: 2,
						summaryNack: 2,
						submitOp: 2,
					},
				}),
			),
	};

	createSummarizerFuzzSuite(model);
});
