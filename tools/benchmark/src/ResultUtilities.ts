/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	BenchmarkResult,
	BenchmarkError,
	BenchmarkData,
	CollectedData,
} from "./ResultTypes.js";
import { timer } from "./timer.js";

/**
 * Wraps a benchmark function, measuring its total execution time and capturing either its
 * {@link CollectedData} result or any thrown exception as a {@link BenchmarkResult}.
 * @remarks
 * Useful for wrapping the body of benchmarks.
 * Users of mocha can use {@link benchmarkIt} which is built on this.
 * @public
 */
export function captureResults(
	f: () => CollectedData | Promise<CollectedData>,
): () => Promise<{ result: BenchmarkResult; exception?: Error }> {
	return async () => {
		const startTime = timer.now();

		let data: CollectedData;
		try {
			data = await f();
		} catch (error) {
			const benchmarkError: BenchmarkError = { error: (error as Error).message };
			return { result: benchmarkError, exception: error as Error };
		}

		const elapsedSeconds = timer.toSeconds(startTime, timer.now());

		const result: BenchmarkData = {
			elapsedSeconds,
			data,
		};

		return { result };
	};
}
