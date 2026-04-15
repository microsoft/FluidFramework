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
		...benchmarkMemoryUse(memoryUseOfValue(() => createLocalMap("testMap"))),
	});

	const numbersOfEntriesForTests = isInPerformanceTestingMode
		? [1000, 10_000, 100_000]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[10];

	for (const x of numbersOfEntriesForTests) {
		benchmarkIt({
			title: `Add ${x} integers to a local map`,
			...benchmarkMemoryUse(
				memoryAddedBy({
					setup: () => createLocalMap("testMap"),
					modify: (map) => {
						for (let i = 0; i < x; i++) {
							map.set(i.toString().padStart(6, "0"), i);
						}
					},
				}),
			),
		});

		benchmarkIt({
			title: `Add ${x} integers to a local map, clear it`,
			...benchmarkMemoryUse(
				memoryAddedBy({
					setup: () => createLocalMap("testMap"),
					modify: (map) => {
						for (let i = 0; i < x; i++) {
							map.set(i.toString().padStart(6, "0"), i);
						}
						map.clear();
					},
				}),
			),
		});
	}
});
