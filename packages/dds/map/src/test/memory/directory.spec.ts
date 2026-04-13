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
		...benchmarkMemoryUse(memoryUseOfValue(() => createLocalDirectory("testDirectory"))),
	});

	const numbersOfEntriesForTests = isInPerformanceTestingMode
		? [1000, 10_000, 100_000]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[10];

	for (const x of numbersOfEntriesForTests) {
		benchmarkIt({
			title: `Add ${x} integers to a local directory`,
			...benchmarkMemoryUse(
				memoryAddedBy({
					setup: () => createLocalDirectory("testDirectory"),
					modify: (dir) => {
						for (let i = 0; i < x; i++) {
							dir.set(i.toString().padStart(6, "0"), i);
						}
					},
				}),
			),
		});

		benchmarkIt({
			title: `Add ${x} integers to a local directory, clear it`,
			...benchmarkMemoryUse(
				memoryAddedBy({
					setup: () => createLocalDirectory("testDirectory"),
					modify: (dir) => {
						for (let i = 0; i < x; i++) {
							dir.set(i.toString().padStart(6, "0"), i);
						}
						dir.clear();
					},
				}),
			),
		});
	}
});
