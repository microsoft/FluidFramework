/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmarkMemoryUse } from "../memoryBenchmarking";
import { benchmarkIt } from "../mocha";

describe("memory use", () => {
	benchmarkIt({
		title: "small array",
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

	benchmarkIt({
		title: "large array",
		...benchmarkMemoryUse({
			benchmarkFn: async (callbacks) => {
				const a: number[] = [];
				while (callbacks.continue()) {
					await callbacks.beforeAllocation();

					a.length = 10000;
					a.fill(0);
					await callbacks.whileAllocated();
					a.length = 0;

					await callbacks.afterDeallocation();
				}
			},
		}),
	});
});
