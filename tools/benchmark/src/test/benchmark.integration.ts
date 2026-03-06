/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";
// For these tests, import from the public AIP like a user would.
import {
	benchmarkDuration,
	benchmarkIt,
	benchmarkMemoryUse,
	collectDurationData,
	collectMemoryUseData,
	ValueType,
	type CollectedData,
} from "..";

// Some integration tests, which validate use cases that users of this package can do.
// Some of these produce scenarios which are interesting for the reporter, and validating them can involve running the `perf` script and looking at the output.

describe("integration tests", () => {
	benchmarkIt({
		title: "benchmarkIt test",
		run: (): CollectedData => [
			{
				name: "demo",
				// Measure anything, and report the result:
				value: "hello world".length,
				units: "letters",
				type: ValueType.SmallerIsBetter,
				significance: "Primary",
			},
		],
	});

	benchmarkIt({
		title: "larger is better",
		run: (): CollectedData => [
			{
				name: "demo",
				value: 100000,
				units: "numbers",
				type: ValueType.LargerIsBetter,
				significance: "Primary",
			},
		],
	});

	benchmarkIt({
		title: "misc data formatting",
		run: (): CollectedData => [
			{
				name: "demo",
				value: 1000000000,
				units: "bytes",
				type: ValueType.SmallerIsBetter,
				significance: "Primary",
			},
			{
				name: "Samples",
				value: 1000,
				units: "count",
				type: ValueType.SmallerIsBetter,
			},
			{
				name: "Period",
				value: 12345678.9,
				units: "ns/op",
				type: ValueType.SmallerIsBetter,
			},
		],
	});

	benchmarkIt({
		title: "benchmarkDuration test - basic",
		...benchmarkDuration({
			minBatchDurationSeconds: 0,
			minBatchCount: 1,
			maxBenchmarkDurationSeconds: 0,
			benchmarkFn: () => {
				// no-op
			},
		}),
	});

	benchmarkIt({
		title: "benchmarkDuration test - async",
		...benchmarkDuration({
			minBatchDurationSeconds: 0,
			minBatchCount: 1,
			maxBenchmarkDurationSeconds: 0,
			benchmarkFnAsync: async () => {
				// no-op
			},
		}),
	});

	benchmarkIt({
		title: "benchmarkDuration test - custom",
		...benchmarkDuration({
			minBatchDurationSeconds: 0,
			minBatchCount: 1,
			maxBenchmarkDurationSeconds: 0,
			benchmarkFnCustom: async (state) => {
				// Before test custom setup
				const foo = { value: -1 };
				let running: boolean;
				do {
					// Per batch custom setup
					foo.value = 0;
					running = state.timeBatch(() => {
						foo.value++;
					});
					// After batch custom cleanup/validation
					assert.equal(foo.value, state.iterationsPerBatch);
				} while (running);
				// After test custom cleanup
				foo.value = -1;
			},
		}),
	});

	benchmarkIt({
		title: "benchmarkDuration test - custom inner loop",
		...benchmarkDuration({
			minBatchDurationSeconds: 0,
			minBatchCount: 1,
			maxBenchmarkDurationSeconds: 0,
			benchmarkFnCustom: async (state) => {
				// Before test custom setup
				const foo = { value: -1 };
				let running: boolean;
				do {
					// Per batch custom setup
					foo.value = 0;
					let counter = state.iterationsPerBatch;
					// Custom inner loop with manual timing allows more control.
					const before = state.timer.now();
					while (counter--) {
						foo.value++;
					}
					const after = state.timer.now();
					running = state.recordBatch(state.timer.toSeconds(before, after));
					// After batch custom cleanup/validation
					assert.equal(foo.value, state.iterationsPerBatch);
				} while (running);
				// After test custom cleanup
				foo.value = -1;
			},
		}),
	});

	benchmarkIt({
		title: "collectDurationData test",
		category: "Duration",
		run: () => {
			// Before test custom setup
			const foo = { value: -1 };
			return collectDurationData({
				benchmarkFn: () => {
					foo.value++;
				},
			});
		},
	});

	// Putting these in their own suite helps keep the reporter output from having way too many columns in any given table.
	describe("memory use", () => {
		benchmarkIt({
			title: "collectMemoryUseData test",
			...benchmarkMemoryUse({
				benchmarkFn: async (state) => {
					const foo: { value: unknown } = { value: undefined };
					while (state.continue()) {
						foo.value = undefined;
						await state.beforeAllocation();
						foo.value = new Array(1000000).fill("leak");
						await state.whileAllocated();
					}
					// After test custom cleanup
					foo.value = -1;
				},
			}),
		});

		// This pattern isn't very useful since does not allow much what beyond benchmarkMemoryUse does.
		// It does allow adding extra data to the result though, which might be useful in some cases.
		benchmarkIt({
			title: "collectMemoryUseData test",
			category: "Memory",
			run: async () => {
				// Before test custom setup
				const foo: { value: unknown } = { value: undefined };
				const data: CollectedData = await collectMemoryUseData({
					benchmarkFn: async (state) => {
						while (state.continue()) {
							foo.value = undefined;
							await state.beforeAllocation();
							foo.value = new Array(1000000).fill("leak");
							await state.whileAllocated();
						}
						// After test custom cleanup
						foo.value = -1;
					},
				});
				return [
					...data,
					{
						name: "extra data",
						value: 1,
					},
				];
			},
		});
	});

	describe("duplicate suite name", () => {
		benchmarkIt({
			title: "test",
			run: (): CollectedData => [
				{
					name: "the data",
					value: 1,
					units: "numbers",
					type: ValueType.SmallerIsBetter,
					significance: "Primary",
				},
			],
		});
	});

	describe("duplicate suite name", () => {
		benchmarkIt({
			title: "test",
			run: (): CollectedData => [
				{
					name: "the data",
					value: 1,
					units: "numbers",
					type: ValueType.SmallerIsBetter,
					significance: "Primary",
				},
			],
		});

		// With duplicate test
		benchmarkIt({
			title: "test",
			run: (): CollectedData => [
				{
					name: "the data",
					value: 1,
					units: "numbers",
					type: ValueType.SmallerIsBetter,
					significance: "Primary",
				},
			],
		});
	});

	describe("nested", () => {
		describe("nested", () => {
			// Test empty suite name
			describe("", () => {
				benchmarkIt({
					title: "in empty named suite",
					run: (): CollectedData => [
						{
							name: "the data",
							value: 1,
							units: "numbers",
							type: ValueType.SmallerIsBetter,
							significance: "Primary",
						},
					],
				});
			});

			benchmarkIt({
				title: "outside empty named suite",
				run: (): CollectedData => [
					{
						name: "the data",
						value: 1,
						units: "numbers",
						type: ValueType.SmallerIsBetter,
						significance: "Primary",
					},
				],
			});
		});
	});
});
