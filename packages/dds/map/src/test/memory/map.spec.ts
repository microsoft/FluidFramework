/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	benchmarkIt,
	benchmarkMemoryUse,
	isInPerformanceTestingMode,
} from "@fluid-tools/benchmark";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import { type ISharedMap, SharedMap } from "../../index.js";

function createLocalMap(id: string): ISharedMap {
	const map = SharedMap.create(
		new MockFluidDataStoreRuntime({ registry: [SharedMap.getFactory()] }),
		id,
	);
	return map;
}

describe("SharedMap memory usage", () => {
	// IMPORTANT: variables scoped to the test suite are a big problem for memory-profiling tests
	// because they won't be out of scope when we garbage-collect between runs of the same test,
	// and that will skew measurements. Tests should allocate all the memory they need using local
	// variables scoped to the test function itself, so several iterations of a given test can
	// measure from the same baseline (as much as possible).

	beforeEach(async () => {
		// CAREFUL: usually beforeEach/afterEach hooks are used to initialize or interact with variables
		// whose scope is the encompasing test suite, but that's a problem for memory-profiling tests.
		// See the comment at the top of the test suite for more details.
	});

	afterEach(() => {
		// CAREFUL: usually beforeEach/afterEach hooks are used to initialize or interact with variables
		// whose scope is the encompasing test suite, but that's a problem for memory-profiling tests.
		// See the comment at the top of the test suite for more details.
	});

	benchmarkIt({
		title: "Create empty map",
		...benchmarkMemoryUse({
			benchmarkFn: async (state) => {
				while (state.continue()) {
					await state.beforeAllocation();
					{
						// eslint-disable-next-line @typescript-eslint/no-unused-vars
						const map = createLocalMap("testMap");
						await state.whileAllocated();
					}
					await state.afterDeallocation();
				}
			},
		}),
	});

	const numbersOfEntriesForTests = isInPerformanceTestingMode
		? [1000, 10_000, 100_000]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[10];

	for (const x of numbersOfEntriesForTests) {
		benchmarkIt({
			title: `Add ${x} integers to a local map`,
			...benchmarkMemoryUse({
				benchmarkFn: async (state) => {
					while (state.continue()) {
						await state.beforeAllocation();
						{
							const map = createLocalMap("testMap");
							for (let i = 0; i < x; i++) {
								map.set(i.toString().padStart(6, "0"), i);
							}
							await state.whileAllocated();
						}
						await state.afterDeallocation();
					}
				},
			}),
		});

		benchmarkIt({
			title: `Add ${x} integers to a local map, clear it`,
			...benchmarkMemoryUse({
				benchmarkFn: async (state) => {
					while (state.continue()) {
						await state.beforeAllocation();
						{
							const map = createLocalMap("testMap");
							for (let i = 0; i < x; i++) {
								map.set(i.toString().padStart(6, "0"), i);
							}
							map.clear();
							await state.whileAllocated();
						}
						await state.afterDeallocation();
					}
				},
			}),
		});
	}
});
