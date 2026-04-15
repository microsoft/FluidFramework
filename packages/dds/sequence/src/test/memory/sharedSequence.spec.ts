/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	benchmarkIt,
	benchmarkMemoryUse,
	isInPerformanceTestingMode,
	memoryAddedBy,
	memoryUseOfValue,
} from "@fluid-tools/benchmark";

import { SubSequence } from "../../sharedSequence.js";

describe("SharedSequence memory usage", () => {
	benchmarkIt({
		title: "Create empty SharedSequence",
		...benchmarkMemoryUse(memoryUseOfValue(() => new SubSequence<number>([]))),
	});

	const numbersOfEntriesForTests = isInPerformanceTestingMode
		? [100, 1000, 10_000]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[10];

	for (const x of numbersOfEntriesForTests) {
		benchmarkIt({
			title: `Append and remove ${x} subsequences`,
			...benchmarkMemoryUse(
				memoryAddedBy({
					setup: () => new SubSequence<number>([]),
					modify: (segment) => {
						for (let i = 0; i < x; i++) {
							segment.append(new SubSequence<number>([i]));
							segment.removeRange(0, 1);
						}
					},
				}),
			),
		});
	}
});
