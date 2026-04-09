/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

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
	benchmarkIt({
		title: "Create empty map",
		...benchmarkMemoryUse({
			benchmarkFn: async (state) => {
				while (state.continue()) {
					await state.beforeAllocation();
					{
						const map = createLocalMap("testMap");
						await state.whileAllocated();
						assert(map.id === "testMap");
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
