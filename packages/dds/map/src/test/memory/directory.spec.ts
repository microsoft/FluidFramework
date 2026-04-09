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

import { type ISharedDirectory, SharedDirectory } from "../../index.js";

function createLocalDirectory(id: string): ISharedDirectory {
	const directory = SharedDirectory.create(
		new MockFluidDataStoreRuntime({ registry: [SharedDirectory.getFactory()] }),
		id,
	);
	return directory;
}

describe("SharedDirectory memory usage", () => {
	benchmarkIt({
		title: "Create empty directory",
		...benchmarkMemoryUse({
			benchmarkFn: async (state) => {
				while (state.continue()) {
					await state.beforeAllocation();
					{
						const dir = createLocalDirectory("testDirectory");
						await state.whileAllocated();
						assert(dir.id === "testDirectory");
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
			title: `Add ${x} integers to a local directory`,
			...benchmarkMemoryUse({
				benchmarkFn: async (state) => {
					while (state.continue()) {
						await state.beforeAllocation();
						{
							const dir = createLocalDirectory("testDirectory");
							for (let i = 0; i < x; i++) {
								dir.set(i.toString().padStart(6, "0"), i);
							}
							await state.whileAllocated();
						}
						await state.afterDeallocation();
					}
				},
			}),
		});

		benchmarkIt({
			title: `Add ${x} integers to a local directory, clear it`,
			...benchmarkMemoryUse({
				benchmarkFn: async (state) => {
					while (state.continue()) {
						await state.beforeAllocation();
						{
							const dir = createLocalDirectory("testDirectory");
							for (let i = 0; i < x; i++) {
								dir.set(i.toString().padStart(6, "0"), i);
							}
							dir.clear();
							await state.whileAllocated();
						}
						await state.afterDeallocation();
					}
				},
			}),
		});
	}
});
