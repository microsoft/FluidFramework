/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BenchmarkResult, BenchmarkError, BenchmarkData } from "./ResultTypes";
import { timer } from "./timer";

/**
 * Wraps a function that returns CustomData, measuring its execution time
 * and capturing either its result or exception.
 * Returns a callback suitable for passing to emitResultsMocha.
 * This is a generic utility that is neither mocha-specific nor time benchmark-specific.
 */
export function captureResults<T>(
	f: () => T | Promise<T>,
): () => Promise<{ result: BenchmarkResult<T>; exception?: Error }> {
	return async () => {
		const startTime = timer.now();

		let customData: T;
		try {
			customData = await f();
		} catch (error) {
			const benchmarkError: BenchmarkError = { error: (error as Error).message };
			return { result: benchmarkError, exception: error as Error };
		}

		const elapsedSeconds = timer.toSeconds(startTime, timer.now());

		const result: BenchmarkData<T> = {
			elapsedSeconds,
			customData,
		};

		return { result };
	};
}
