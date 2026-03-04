/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { benchmarkMemoryUse } from "../memoryBenchmarking";
import { benchmarkIt } from "../mocha";

describe("memory use", () => {
	benchmarkIt({
		title: "new small array test 1",
		...benchmarkMemoryUse({
			benchmarkFn: async (callbacks) => {
				let a: number[] = [];
				while (callbacks.continue()) {
					await callbacks.beforeAllocation();

					a.length = 100;
					a.fill(0);
					await callbacks.whileAllocated();
					a = [];

					await callbacks.afterDeallocation();
				}
			},
		}),
	});

	// There was an issue where the first memory test got extra noise.
	// To help detect issues like that, we have two copies of the same test which should produce the same results.
	benchmarkIt({
		title: "new small array test 2",
		...benchmarkMemoryUse({
			benchmarkFn: async (callbacks) => {
				let a: number[] = [];
				while (callbacks.continue()) {
					await callbacks.beforeAllocation();

					a.length = 100;
					a.fill(0);
					await callbacks.whileAllocated();
					a = [];

					await callbacks.afterDeallocation();
				}
			},
		}),
	});

	benchmarkIt({
		title: "new medium array",
		...benchmarkMemoryUse({
			benchmarkFn: async (callbacks) => {
				let a: number[] = [];
				while (callbacks.continue()) {
					await callbacks.beforeAllocation();

					a.length = 1024;
					a.fill(0);
					await callbacks.whileAllocated();
					a = [];

					await callbacks.afterDeallocation();
				}
			},
		}),
	});

	benchmarkIt({
		title: "new large array",
		...benchmarkMemoryUse({
			benchmarkFn: async (callbacks) => {
				let a: number[] = [];
				while (callbacks.continue()) {
					await callbacks.beforeAllocation();

					a.length = 1024 * 1024;
					a.fill(0);
					await callbacks.whileAllocated();
					a = [];

					await callbacks.afterDeallocation();
				}
			},
		}),
	});
});
