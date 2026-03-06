/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The error case of {@link BenchmarkResult}: indicates the benchmark did not complete successfully.
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
 * Returns true if `result` is a {@link BenchmarkError}.
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
 * How important a given {@link Measurement} is within a benchmark's set of measurements.
 * @remarks
 * Analogous to a logging level: some outputs show only primary measurements (e.g. the suite geometric mean),
 * while others include secondary measurements and optionally diagnostic ones.
 *
 * This is unrelated to statistical significance, though secondary measurements often include
 * details like margin of error that can inform statistical significance.
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
 * The measurements collected from a benchmark run.
 * @remarks
 * A required {@link PrimaryMeasurement} followed by zero or more additional {@link Measurement | Measurements}.
 * @public
 */
export type CollectedData = readonly [PrimaryMeasurement, ...Measurement[]];

/**
 * The main measurement for a benchmark, which will be used for evaluating improvements and regressions.
 * @public
 */
export type PrimaryMeasurement = Required<Measurement> & { significance: "Primary" };
