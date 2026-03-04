/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
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

	// Example from readme
	function createSomething(): Map<string, number> {
		const map: Map<string, number> = new Map();
		for (let i = 0; i < 1000; i++) {
			map.set(`${i}`, i);
		}
		return map;
	}
	type MyObject = ReturnType<typeof createSomething>;
	benchmarkIt({
		title: "My memory test",
		...benchmarkMemoryUse({
			benchmarkFn: async (state) => {
				let myObject: MyObject | undefined;
				while (state.continue()) {
					await state.beforeAllocation();
					// Allocate memory here.
					myObject = createSomething();
					await state.whileAllocated();
					// Release references to the memory here so it can be reclaimed by GC.
					myObject = undefined;
					await state.afterDeallocation();
				}
				// Use value to make clear to linter and optimizer that assignment to undefined matters.
				assert(myObject === undefined);
			},
		}),
	});
});
