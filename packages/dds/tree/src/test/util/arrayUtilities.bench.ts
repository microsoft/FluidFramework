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
