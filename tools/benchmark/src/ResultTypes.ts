/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Contains the samples of all measurements we track for a given benchmark (a test which was potentially iterated
 * several times). Each property is an array and all should be the same length, which is the number of iterations
 * done during the benchmark.
 * @public
 */
export interface Stats {
	/**
	 * Margin of error.
	 */
	readonly marginOfError: number;

	/**
	 * Margin of error as a percentage of the mean.
	 */
	readonly marginOfErrorPercent: number;

	/**
	 * Standard error of the mean.
	 */
	readonly standardErrorOfMean: number;

	/**
	 * Standard deviation.
	 */
	readonly standardDeviation: number;

	/**
	 * Arithmetic mean.
	 */
	readonly arithmeticMean: number;

	/**
	 * Sample values.
	 */
	readonly samples: readonly number[];

	/**
	 * Variance.
	 */
	readonly variance: number;
}

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
