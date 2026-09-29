/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	BenchmarkMode,
	BenchmarkType,
	benchmarkDurationBatchless,
	benchmarkIt,
	currentBenchmarkMode,
} from "@fluid-tools/benchmark";

import { replaceArrayRange } from "../../util/index.js";
import {
	replaceArrayRangeWithoutSpread,
	// Allow importing from this specific file which is being tested:
	// eslint-disable-next-line import-x/no-internal-modules
} from "../../util/arrayUtilities.js";
import { configureBenchmarkHooks } from "../utils.js";

describe("array range replacement", () => {
	configureBenchmarkHooks();

	const replacementSizes =
		currentBenchmarkMode === BenchmarkMode.Performance
			? [100, 250, 500, 750, 1000, 10_000]
			: [100];
	const maxBenchmarkDurationSeconds = 3;

	for (const replacementSize of replacementSizes) {
		const startIndex = 50;
		const endIndex = startIndex + replacementSize + 1;
		const original = Array.from({ length: endIndex + 50 }, (_, index) => index);
		const replacement = Array.from({ length: replacementSize }, (_, index) => -index);

		benchmarkIt({
			type: BenchmarkType.Measurement,
			title: `native splice with ${replacementSize} replacement items`,
			...benchmarkDurationBatchless({
				benchmarkFn: (state) => {
					let running: boolean;
					do {
						const array = [...original];
						running = state.time(() => {
							array.splice(startIndex, endIndex - startIndex, ...replacement);
						});
					} while (running);
				},
				maxBenchmarkDurationSeconds,
			}),
		});

		benchmarkIt({
			type: BenchmarkType.Measurement,
			title: `replaceArrayRange with ${replacementSize} replacement items`,
			...benchmarkDurationBatchless({
				benchmarkFn: (state) => {
					let running: boolean;
					do {
						const array = [...original];
						running = state.time(() => {
							replaceArrayRange(array, startIndex, endIndex, replacement);
						});
					} while (running);
				},
				maxBenchmarkDurationSeconds,
			}),
		});
	}
});

/**
 * Mirrors {@link replaceArrayRangeWithoutSpread} but fills the replacement with `for ... of entries()`
 * instead of an indexed loop. Only used by the benchmark below to measure the iterator-protocol overhead
 * in that hot loop, justifying the indexed loop the production implementation uses.
 */
function replaceArrayRangeWithoutSpreadUsingEntries<T>(
	array: T[],
	startIndex: number,
	endIndex: number,
	replacement: readonly T[],
): void {
	const replacementItems = replacement === array ? [...replacement] : replacement;
	const originalLength = array.length;
	const newLength = originalLength + replacementItems.length - (endIndex - startIndex);
	if (newLength > originalLength) {
		array.length = newLength;
	}
	array.copyWithin(startIndex + replacementItems.length, endIndex, originalLength);
	array.length = newLength;
	for (const [replacementIndex, item] of replacementItems.entries()) {
		array[startIndex + replacementIndex] = item;
	}
}

// Compares the two loop styles for filling the replacement in the argument-safe path: an indexed loop
// (used in production) versus `for ... of entries()`. Justifies the indexed loop choice noted in
// replaceArrayRangeWithoutSpread.
describe("argument-safe replacement loop styles", () => {
	configureBenchmarkHooks();

	const replacementSizes =
		currentBenchmarkMode === BenchmarkMode.Performance
			? [100, 250, 500, 750, 1000, 10_000]
			: [100];
	const maxBenchmarkDurationSeconds = 3;

	for (const replacementSize of replacementSizes) {
		const startIndex = 50;
		const endIndex = startIndex + replacementSize + 1;
		const original = Array.from({ length: endIndex + 50 }, (_, index) => index);
		const replacement = Array.from({ length: replacementSize }, (_, index) => -index);

		benchmarkIt({
			type: BenchmarkType.Measurement,
			title: `indexed loop with ${replacementSize} replacement items`,
			...benchmarkDurationBatchless({
				benchmarkFn: (state) => {
					let running: boolean;
					do {
						const array = [...original];
						running = state.time(() => {
							replaceArrayRangeWithoutSpread(array, startIndex, endIndex, replacement);
						});
					} while (running);
				},
				maxBenchmarkDurationSeconds,
			}),
		});

		benchmarkIt({
			type: BenchmarkType.Measurement,
			title: `entries() loop with ${replacementSize} replacement items`,
			...benchmarkDurationBatchless({
				benchmarkFn: (state) => {
					let running: boolean;
					do {
						const array = [...original];
						running = state.time(() => {
							replaceArrayRangeWithoutSpreadUsingEntries(
								array,
								startIndex,
								endIndex,
								replacement,
							);
						});
					} while (running);
				},
				maxBenchmarkDurationSeconds,
			}),
		});
	}
});
