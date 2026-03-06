/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Result of failing to run a benchmark.
 * @remarks
 * See {@link BenchmarkResult} for more details.
 * @public
 * @sealed
 */
export interface BenchmarkError {
	/**
	 * Error message.
	 */
	readonly error: string;
}

/**
 * Result of trying to run a benchmark.
 * @remarks
 * Produced by {@link captureResults}.
 * @public
 * @sealed
 */
export type BenchmarkResult = BenchmarkError | CollectedData;

/**
 * Provides type narrowing when the provided result is a {@link BenchmarkError}.
 */
export function isResultError(result: BenchmarkResult): result is BenchmarkError {
	return (result as Partial<BenchmarkError>).error !== undefined;
}

/**
 * A single measurement for a benchmark result.
 * @public
 */
export interface Measurement {
	/** Display name for this measurement. */
	readonly name: string;
	/** The measured value. */
	readonly value: number;
	/** Units for the value (e.g. `"ns/op"`, `"bytes"`, `"count"`). */
	readonly units?: string;
	/** Whether a smaller or larger value is better. */
	readonly type?: ValueType;

	/**
	 * How important this measurement is within the benchmark's set of measurements.
	 */
	readonly significance?: Significance;
}

/**
 * How important a given {@link Measurement} is within a given benchmark's set of measurements.
 * @remarks
 * This is used somewhat like a logging level:
 * some outputs may choose to only display primary measurements (such as the suite geometric mean),
 * while others might show secondary measurements with an option to include diagnostic measurements as well.
 *
 * This is unrelated to statistical significance,
 * though often secondary measurements are used for details like margin of error
 * which can be used to determine statistical significance.
 * @public
 */
export type Significance = "Primary" | "Secondary" | "Diagnostic";

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
export type CollectedData = readonly [PrimaryMeasurement, ...Measurement[]];

/**
 * The main measurement for a benchmark, which will be used for evaluating improvements and regressions.
 * @public
 */
export type PrimaryMeasurement = Required<Measurement> & { significance: "Primary" };
