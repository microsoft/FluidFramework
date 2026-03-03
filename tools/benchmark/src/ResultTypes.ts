/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Result of successfully running a benchmark.
 *
 * TODO: flatten this into a CollectedData, and validate in the process.
 * @public
 */
export interface BenchmarkData {
	/**
	 * Time it took to run the benchmark in seconds.
	 * @remarks
	 * This is metadata about the benchmark run (how long it took to collect the data),
	 * not a measured result.
	 */
	readonly elapsedSeconds: number;

	/**
	 * Custom data.
	 */
	readonly data: CollectedData;
}

/**
 * Result of failing to run a benchmark.
 * @public
 */
export interface BenchmarkError {
	/**
	 * Error message.
	 */
	readonly error: string;
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

/**
 * A single measurement for a benchmark result.
 * @public
 */
export interface Measurement {
	readonly name: string;
	readonly value: number;
	readonly units?: string;
	readonly type?: ValueType;
}

/**
 * Indicates whether a benchmark result is better if the value is smaller or larger.
 * @remarks
 * This impacts how regressions and improvements are measured and how results are aggregated into a geometric mean.
 * @public
 */
export enum ValueType {
	SmallerIsBetter = "SmallerIsBetter",
	LargerIsBetter = "LargerIsBetter",
}

/**
 * Data for a benchmark.
 * @public
 */
export interface CollectedData {
	/**
	 * Will be used for evaluating improvements and regressions.
	 */
	readonly primary: Required<Measurement>;
	/**
	 * Additional stats to be included in the output, but won't be used for evaluating improvements/regressions.
	 */
	readonly additional: readonly Measurement[];
}
