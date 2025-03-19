/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs";
import path from "node:path";

import {
	type IMemoryTestObject,
	benchmarkMemory,
	isInPerformanceTestingMode,
} from "@fluid-tools/benchmark";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import { type ISharedMap, SharedMap } from "../../index.js";
const baselineFilePath = path.join(__dirname, "memory_baseline.json");

// Load previous baseline if exists
const loadBaselines = (): Record<string, number> => {
	try {
		return JSON.parse(fs.readFileSync(baselineFilePath, "utf8")) as Record<string, number>;
	} catch {
		return {};
	}
};

// Function to update baseline file after test runs
const saveBaseline = (testTitle: string, memoryUsage: number): void => {
	const baselines = loadBaselines();
	baselines[testTitle] = memoryUsage;
	// eslint-disable-next-line unicorn/no-null
	fs.writeFileSync(baselineFilePath, JSON.stringify(baselines, null, 2));
};

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

	benchmarkMemory(
		new (class implements IMemoryTestObject {
			public readonly title = "Create empty map";
			public readonly minSampleCount = 500;
			public baselineMemoryUsage = loadBaselines()[this.title] ?? 0;
			private map: ISharedMap = createLocalMap("testMap");

			public async run(): Promise<void> {
				this.map = createLocalMap("testMap");
			}
			public afterIteration(): void {
				if (process.env.SAVE_MEMORY_BASELINE) {
					const memoryUsage = process.memoryUsage().heapUsed;
					saveBaseline(this.title, memoryUsage);
				}
			}
		})(),
	);

	const numbersOfEntriesForTests = isInPerformanceTestingMode
		? [1000, 10_000, 100_000]
		: // When not measuring perf, use a single smaller data size so the tests run faster.
			[10];

	for (const x of numbersOfEntriesForTests) {
		benchmarkMemory(
			new (class implements IMemoryTestObject {
				public readonly title = `Add ${x} integers to a local map`;
				private map: ISharedMap = createLocalMap("testMap");

				public async run(): Promise<void> {
					for (let i = 0; i < x; i++) {
						this.map.set(i.toString().padStart(6, "0"), i);
					}
				}

				public beforeIteration(): void {
					this.map = createLocalMap("testMap");
				}
			})(),
		);

		benchmarkMemory(
			new (class implements IMemoryTestObject {
				public readonly title = `Add ${x} integers to a local map, clear it`;
				private map: ISharedMap = createLocalMap("testMap");

				public async run(): Promise<void> {
					for (let i = 0; i < x; i++) {
						this.map.set(i.toString().padStart(6, "0"), i);
					}
					this.map.clear();
				}

				public beforeIteration(): void {
					this.map = createLocalMap("testMap");
				}
			})(),
		);
	}
});
