/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmarkMemoryUse } from "../memoryBenchmarking";
import { benchmarkIt } from "../mocha";

describe("`benchmarkMemory` function 2", () => {
	benchmarkIt({
		title: "benchmarkMemory test",
		...benchmarkMemoryUse({
			benchmarkFn: async (callbacks) => {
				const a: number[] = [];
				while (callbacks.continue()) {
					await callbacks.beforeAllocation();

					a.length = 100;
					a.fill(0);
					await callbacks.whileAllocated();
					a.length = 0;

					await callbacks.afterDeallocation();
				}
			},
		}),
	});
});
