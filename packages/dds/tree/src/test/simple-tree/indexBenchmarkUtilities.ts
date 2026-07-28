/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	BenchmarkMode,
	BenchmarkType,
	benchmarkDuration,
	benchmarkIt,
	currentBenchmarkMode,
} from "@fluid-tools/benchmark";

import type { TreeIndex } from "../../feature-libraries/index.js";
import type { ImplicitFieldSchema, TreeNode, TreeView } from "../../simple-tree/index.js";

/**
 * Configuration for a single index benchmark scenario.
 */
export interface IndexBenchmarkScenario<TKey, TValue> {
	/**
	 * Human-readable title for the scenario.
	 */
	readonly title: string;

	/**
	 * Creates a fresh TreeView and index for this scenario.
	 * Called once per benchmark iteration batch to ensure fresh state.
	 */
	setup(): IndexBenchmarkSetup<TKey, TValue>;
}

/**
 * The result of setting up an index benchmark, providing access to the index and test data.
 */
export interface IndexBenchmarkSetup<TKey, TValue> {
	/**
	 * The index under test.
	 */
	readonly index: TreeIndex<TKey, TValue>;

	/**
	 * Keys that are known to exist in the index for lookup benchmarks.
	 */
	readonly existingKeys: readonly TKey[];

	/**
	 * Keys that are known NOT to exist in the index for miss benchmarks.
	 */
	readonly missingKeys: readonly TKey[];

	/**
	 * Optional function that mutates the tree (for measuring index update costs).
	 * Should add a single node to the tree.
	 */
	readonly insertNode?: () => void;

	/**
	 * Optional function that removes a node from the tree (for measuring index update costs on removal).
	 */
	readonly removeNode?: () => void;
}

/**
 * Configuration for the index benchmark suite.
 */
export interface IndexBenchmarkSuiteConfig<TKey, TValue> {
	/**
	 * The name of the index being benchmarked (used in test titles).
	 */
	readonly indexName: string;

	/**
	 * Scenarios at different sizes. Each entry is [nodeCount, BenchmarkType].
	 */
	readonly sizes: readonly (readonly [number, BenchmarkType])[];

	/**
	 * Factory that creates a benchmark scenario for a given node count.
	 */
	createScenario(nodeCount: number): IndexBenchmarkScenario<TKey, TValue>;
}

/**
 * Default node counts for index benchmarks.
 * Uses small count for regular test runs and larger counts for full performance mode.
 */
export const defaultIndexBenchmarkSizes: [number, BenchmarkType][] = [
	[10, BenchmarkType.Measurement],
	...(currentBenchmarkMode === BenchmarkMode.Performance
		? [
				[100, BenchmarkType.Perspective] as [number, BenchmarkType],
				[1000, BenchmarkType.Perspective] as [number, BenchmarkType],
				[10_000, BenchmarkType.Measurement] as [number, BenchmarkType],
			]
		: []),
];

/**
 * Smaller node counts for deep (tall) trees that hit call-stack limits at high depths.
 */
export const deepTreeBenchmarkSizes: [number, BenchmarkType][] = [
	[10, BenchmarkType.Measurement],
	...(currentBenchmarkMode === BenchmarkMode.Performance
		? [
				[100, BenchmarkType.Perspective] as [number, BenchmarkType],
				[500, BenchmarkType.Measurement] as [number, BenchmarkType],
			]
		: []),
];

/**
 * Generates a complete benchmark suite for a tree index.
 *
 * This produces benchmarks for:
 * - Index creation time
 * - Key lookup (hit)
 * - Key lookup (miss)
 * - Iteration over entries
 * - Size property access
 * - Node insertion (index update)
 * - Node removal (index update)
 *
 * @param config - Configuration for the benchmark suite.
 */
export function generateIndexBenchmarkSuite<TKey, TValue>(
	config: IndexBenchmarkSuiteConfig<TKey, TValue>,
): void {
	const { indexName, sizes, createScenario } = config;

	describe(`index creation`, () => {
		for (const [nodeCount, benchmarkType] of sizes) {
			const scenario = createScenario(nodeCount);
			benchmarkIt({
				type: benchmarkType,
				title: `${indexName}: create index with ${nodeCount} nodes`,
				...benchmarkDuration({
					benchmarkFnCustom: async (state) => {
						state.timeAllBatches(() => {
							const { index } = scenario.setup();
							index.dispose();
						});
					},
				}),
			});
		}
	});

	describe(`key lookup (hit)`, () => {
		for (const [nodeCount, benchmarkType] of sizes) {
			const scenario = createScenario(nodeCount);
			benchmarkIt({
				type: benchmarkType,
				title: `${indexName}: lookup existing key (${nodeCount} nodes)`,
				...benchmarkDuration({
					benchmarkFnCustom: async (state) => {
						const { index, existingKeys } = scenario.setup();
						assert(existingKeys.length > 0, "Must have at least one existing key");

						let result: TValue | undefined;
						state.timeAllBatches(() => {
							for (const key of existingKeys) {
								result = index.get(key);
							}
						});
						assert(result !== undefined, "Lookup should return a value for existing key");
						index.dispose();
					},
				}),
			});
		}
	});

	describe(`key lookup (miss)`, () => {
		for (const [nodeCount, benchmarkType] of sizes) {
			const scenario = createScenario(nodeCount);
			benchmarkIt({
				type: benchmarkType,
				title: `${indexName}: lookup missing key (${nodeCount} nodes)`,
				...benchmarkDuration({
					benchmarkFnCustom: async (state) => {
						const { index, missingKeys } = scenario.setup();
						assert(missingKeys.length > 0, "Must have at least one missing key");

						let result: TValue | undefined;
						state.timeAllBatches(() => {
							for (const key of missingKeys) {
								result = index.get(key);
							}
						});
						assert(result === undefined, "Lookup should return undefined for missing key");
						index.dispose();
					},
				}),
			});
		}
	});

	describe(`iteration`, () => {
		for (const [nodeCount, benchmarkType] of sizes) {
			const scenario = createScenario(nodeCount);
			benchmarkIt({
				type: benchmarkType,
				title: `${indexName}: iterate all entries (${nodeCount} nodes)`,
				...benchmarkDuration({
					benchmarkFnCustom: async (state) => {
						const { index } = scenario.setup();

						let count = 0;
						state.timeAllBatches(() => {
							count = 0;
							for (const _ of index) {
								count++;
							}
						});
						assert(count > 0, "Iteration should yield entries");
						index.dispose();
					},
				}),
			});
		}
	});

	describe(`size`, () => {
		for (const [nodeCount, benchmarkType] of sizes) {
			const scenario = createScenario(nodeCount);
			benchmarkIt({
				type: benchmarkType,
				title: `${indexName}: read size (${nodeCount} nodes)`,
				...benchmarkDuration({
					benchmarkFnCustom: async (state) => {
						const { index } = scenario.setup();

						let size = 0;
						state.timeAllBatches(() => {
							size = index.size;
						});
						assert(size > 0, "Index should have entries");
						index.dispose();
					},
				}),
			});
		}
	});

	describe(`node insertion (index update)`, () => {
		for (const [nodeCount, benchmarkType] of sizes) {
			const scenario = createScenario(nodeCount);
			benchmarkIt({
				type: benchmarkType,
				title: `${indexName}: insert node with index maintenance (${nodeCount} nodes)`,
				...benchmarkDuration({
					benchmarkFnCustom: async (state) => {
						let running: boolean;
						do {
							// Fresh tree per batch so inserts don't accumulate
							const { index, insertNode } = scenario.setup();
							if (insertNode === undefined) {
								return;
							}
							running = state.timeBatch(() => {
								insertNode();
							});
							index.dispose();
						} while (running);
					},
				}),
			});
		}
	});

	describe(`node removal (index update)`, () => {
		for (const [nodeCount, benchmarkType] of sizes) {
			const scenario = createScenario(nodeCount);
			benchmarkIt({
				type: benchmarkType,
				title: `${indexName}: remove node with index maintenance (${nodeCount} nodes)`,
				...benchmarkDuration({
					benchmarkFnCustom: async (state) => {
						let running: boolean;
						do {
							// Fresh tree per batch so removes don't exhaust nodes
							const { index, removeNode } = scenario.setup();
							if (removeNode === undefined) {
								return;
							}
							running = state.timeBatch(() => {
								removeNode();
							});
							index.dispose();
						} while (running);
					},
				}),
			});
		}
	});
}
