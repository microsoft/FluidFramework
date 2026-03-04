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

	benchmarkIt({
		title: "no after",
		...benchmarkMemoryUse({
			benchmarkFn: async (callbacks) => {
				while (callbacks.continue()) {
					const a: number[] = [];
					await callbacks.beforeAllocation();
					a.length = 1024;
					a.fill(0);
					await callbacks.whileAllocated();
					// Use "a" to ensure that memory is not freed until whileAllocated.
					assert(a.length === 1024);
				}
			},
		}),
	});

	benchmarkIt({
		title: "linked list",
		...benchmarkMemoryUse({
			benchmarkFn: async (callbacks) => {
				while (callbacks.continue()) {
					await callbacks.beforeAllocation();
					type Node = undefined | { next: Node };
					let head: Node = undefined;
					for (let i = 0; i < 1000; i++) {
						head = { next: head };
					}
					await callbacks.whileAllocated();
					// Use head to ensure that memory is not freed until whileAllocated.
					assert(head !== undefined);
					head = undefined;
					await callbacks.afterDeallocation();
				}
			},
		}),
	});

	benchmarkIt({
		title: "weak linked list",
		...benchmarkMemoryUse({
			benchmarkFn: async (callbacks) => {
				const weakMap = new WeakMap<object, object>();
				while (callbacks.continue()) {
					type Node = undefined | { next: Node };
					const tail: Node = { next: undefined };
					await callbacks.beforeAllocation();
					let head: Node = { next: tail };
					for (let i = 0; i < 1000; i++) {
						const next: Node = { next: head };
						// Store link in opposite direction in weak map.
						weakMap.set(head, next);
						head = next;
					}
					await callbacks.whileAllocated();
					// Use head to ensure that memory is not freed until whileAllocated.
					assert(head !== undefined);
					head = undefined;
					await callbacks.afterDeallocation();
					assert(tail !== undefined);
				}
			},
		}),
	});

	benchmarkIt({
		title: "empty",
		...benchmarkMemoryUse({
			benchmarkFn: async (callbacks) => {
				while (callbacks.continue()) {
					await callbacks.beforeAllocation();
					await callbacks.whileAllocated();
					await callbacks.afterDeallocation();
				}
			},
		}),
	});

	benchmarkIt({
		title: "empty async GC",
		...benchmarkMemoryUse({
			enableAsyncGC: true,
			benchmarkFn: async (callbacks) => {
				while (callbacks.continue()) {
					await callbacks.beforeAllocation();
					await callbacks.whileAllocated();
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
