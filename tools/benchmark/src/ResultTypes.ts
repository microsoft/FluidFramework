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

/**
 * A single benchmark result entry in the report.
 * @public
 */
export interface ReportEntry {
	readonly benchmarkName: string;
	readonly data: BenchmarkResult;
}

/**
 * A suite containing benchmark results and/or child suites.
 * @remarks
 * When using mocha, this corresponds to the contents of a describe block,
 * which may include both it blocks and nested describe blocks.
 * @public
 */
export interface ReportSuite {
	readonly suiteName: string;
	readonly contents: ReportArray;
}

/**
 * The type that is JSON-serialized and written to disk for benchmark report files.
 * @remarks
 * This only includes non-empty suites.
 * When using mocha, this corresponds to the contents of a describe block
 * (or the implicit top level suite).
 * which may include both `it` blocks and nested `describe` blocks.
 * @public
 */
export type ReportArray = (ReportSuite | ReportEntry)[];

/**
 * Type guard for distinguishing between a suite and an entry in the report data structure.
 * @public
 */
export function isSuiteNode(item: ReportSuite | ReportEntry): item is ReportSuite {
	return "contents" in item;
}

/**
 * Parses a JSON string produced by applying `JSON.stringify` to a {@link BenchmarkResult}.
 * @remarks
 * This has some minimal validation to catch common cases of passing in the wrong data,
 * but it assumes the data is generally well formed (e.g. that all the expected properties are present and of the correct type).
 * Uses {@link parseReport} to convert `null` values back to `NaN`.
 * @throws If `json` does not contain a valid {@link BenchmarkResult}.
 * @public
 */
export function parseBenchmarkResult(json: string): BenchmarkResult {
	const report = parseReport(json) as Partial<BenchmarkError & CollectedData>;
	// A minimal sanity check of the data to catch most cases which pass in the wrong thing.
	if (report.error === undefined) {
		if (!Array.isArray(report)) {
			throw new Error(`${JSON.stringify(report)} is not a BenchmarkResult.`);
		}
	} else {
		if (typeof report.error !== "string") {
			throw new Error(`${JSON.stringify(report)} is not a BenchmarkResult.`);
		}
	}
	return report as BenchmarkResult;
}

/**
 * Parses a JSON string for one of the report data structures (e.g. a {@link ReportArray} or {@link ReportSuite}).
 * @remarks
 * Converts `null` values back to `NaN` since JSON does not support `NaN` and reports can contain `NaN` values but not `null`.
 * For {@link BenchmarkResult} values, consider using {@link parseBenchmarkResult} instead, which has some additional validation.
 * @public
 */
export function parseReport(text: string): unknown {
	return JSON.parse(text, (_key, value: unknown): unknown => {
		if (value === null) {
			// Assumes all nulls in the data were NaN values which failed to survive JSON.stringify
			// since JSON doesn't support NaN.
			// If there are actually null values in the data, or infinities, this will cause them to be misreported as NaN.
			// Generally this should be fine, as we don't expect to hit those other cases,
			// and if we do the NaN indicates some numeric issue that should be investigated anyway.
			return Number.NaN;
		}
		return value;
		// This type cast assumes the data is well formed. More validation might be nice, but it should be valid as we control the output.
	});
}
