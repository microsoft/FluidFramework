/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Custom data type for a benchmark.
 * @public
 */
export type CustomData = Record<string, { rawValue: unknown; formattedValue: string }>;

/**
 * Result of successfully running a benchmark.
 * @public
 */
export interface BenchmarkData {
	/**
	 * Time it took to run the benchmark in seconds.
	 * @remarks
	 * This is metadata about the benchmark run (how long it took to collect the data),
	 * not a measured result.
	 */
	elapsedSeconds: number;

	/**
	 * Custom data.
	 */
	customData: CustomData;
}

/**
 * Result of failing to run a benchmark.
 * @public
 */
export interface BenchmarkError {
	/**
	 * Error message.
	 */
	error: string;
}

/**
 * Result of trying to run a benchmark.
 * @public
 */
export type BenchmarkResult = BenchmarkError | BenchmarkData;

/**
 * Provides type narrowing when the provided result is a {@link BenchmarkError}.
 * @public
 */
export function isResultError(result: BenchmarkResult): result is BenchmarkError {
	return (result as Partial<BenchmarkError>).error !== undefined;
}
