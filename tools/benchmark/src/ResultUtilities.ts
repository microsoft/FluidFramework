/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BenchmarkResult, BenchmarkError, BenchmarkData, CustomData } from "./ResultTypes";
import { timer } from "./timer";

/**
 * Wraps a function that returns CustomData, measuring its execution time
 * and capturing either its result or exception.
 * Returns a callback suitable for passing to emitResultsMocha.
 * This is a generic utility that is neither mocha-specific nor time benchmark-specific.
 */
export function captureResults(
	f: () => CustomData | Promise<CustomData>,
): () => Promise<{ result: BenchmarkResult; exception?: Error }> {
	return async () => {
		const startTime = timer.now();

		let customData: CustomData;
		try {
			customData = await f();
		} catch (error) {
			const benchmarkError: BenchmarkError = { error: (error as Error).message };
			return { result: benchmarkError, exception: error as Error };
		}

		const elapsedSeconds = timer.toSeconds(startTime, timer.now());

		const result: BenchmarkData = {
			elapsedSeconds,
			customData,
		};

		return { result };
	};
}
