/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
The MIT License (MIT)

Copyright (c) 2015 Robert Klep

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

// This file is a reporter used with node, so depending on node is fine.
/* eslint-disable import-x/no-nodejs-modules */

/* eslint-disable unicorn/prefer-module */

/* eslint no-console: ["error", { allow: ["log"] }] */
import * as fs from "node:fs";
import * as path from "node:path";

import chalk from "chalk";
import Table from "easy-table";

import {
	isResultError,
	ValueType,
	type BenchmarkData,
	type BenchmarkResult,
	type Measurement,
} from "./ResultTypes";
import { formatMeasurementValue, geometricMean, pad, prettyNumber } from "./RunnerUtilities";

interface BenchmarkResults {
	table: Table;
	disambiguationCounter: number | undefined;
	/**
	 * Results by name, in order.
	 * @remarks
	 * It is possible (but not recommended) to have multiple benchmarks with the same name in a suite.
	 * To preserve such cases, an array is used here instead of a map.
	 */
	benchmarksArray: NamedResult[];
}

interface NamedResult {
	readonly name: string;
	readonly result: BenchmarkResult;
}

/**
 * Collects and formats performance data for a sequence of suites of benchmarks.
 * Data must be provided in the form of one {@link BenchmarkData} for each test in each suite.
 *
 * The data will be aggregated and processed.
 * Human friendly tables are logged to the console, and a machine friendly version is logged to json files.
 * @public
 */
export class BenchmarkReporter {
	/**
	 * Overall totals (one row per suite)
	 */
	private readonly overallSummaryTable: Table = new Table();

	/**
	 * Results for each inprogress suite keyed by suite name.
	 * Includes results for each tests in the suite that has run.
	 *
	 * Tracking multiple suites at once is required due to nesting of suites.
	 */
	private readonly inProgressSuites: Map<string, BenchmarkResults> = new Map<
		string,
		BenchmarkResults
	>();

	/**
	 * All suites which have been seen. Used to detect duplicates.
	 * Value is number of duplicates so far.
	 */
	private readonly allSuites: Map<string, number> = new Map<string, number>();

	private totalSumRuntimeSeconds = 0;
	private totalBenchmarkCount = 0;
	private totalSuccessfulBenchmarkCount = 0;
	private totalGeometricMeanProductValues: number[] = [];

	private readonly outputDirectory: string;

	/**
	 * @param outputDirectory - location to output files to.
	 * If not specified, defaults to a '.output' directory next to the javascript version of this file.
	 */
	public constructor(outputDirectory?: string) {
		// If changing this or the result file logic in general,
		// be sure to update the glob used to look for output files in the perf pipeline.
		// eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
		this.outputDirectory = outputDirectory
			? path.resolve(outputDirectory)
			: path.join(__dirname, ".output");

		fs.mkdirSync(this.outputDirectory, { recursive: true });
	}

	/**
	 * Appends a prettified version of the results of a benchmark instance provided to the provided
	 * BenchmarkResults object.
	 */
	public recordTestResult(suiteName: string, testName: string, result: BenchmarkResult): void {
		let results = this.inProgressSuites.get(suiteName);
		if (results === undefined) {
			const count = this.allSuites.get(suiteName) ?? 0;
			const newCount = count + 1;
			this.allSuites.set(suiteName, newCount);
			if (newCount > 1) {
				// eslint-disable-next-line no-console
				console.warn(
					chalk.yellow(
						`Warning: suite name "${suiteName}" now been used ${newCount} times. Reports will be disambiguated with a trailing number`,
					),
				);
			}

			results = {
				table: new Table(),
				benchmarksArray: [],
				disambiguationCounter: newCount === 1 ? undefined : newCount,
			};
			this.inProgressSuites.set(suiteName, results);
		}

		const { table, benchmarksArray } = results;

		// Make sure to add properties that are not part of the `data` object here.
		benchmarksArray.push({ name: testName, result });
		if (isResultError(result)) {
			table.cell("status", `${pad(4)}${chalk.red("×")}`);
		} else {
			table.cell("status", `${pad(4)}${chalk.green("✔")}`);
		}

		table.cell("name", chalk.italic(testName));

		if (isResultError(result)) {
			table.cell("error", result.error);
		} else {
			table.cell(
				"Test Duration",
				formatMeasurementValue({
					value: result.elapsedSeconds,
					units: "seconds",
					type: ValueType.SmallerIsBetter,
					name: "Test Duration",
				}),
			);

			function measurementCell(measurement: Measurement, primary: boolean): void {
				const text = formatMeasurementValue(measurement);
				const final = primary ? chalk.bold(text) : text;
				table.cell(measurement.name, final, Table.padLeft);
			}

			measurementCell(result.data.primary, true);
			for (const measurement of result.data.additional) {
				measurementCell(measurement, false);
			}
		}

		table.newRow();
	}

	/**
	 * Logs the benchmark results of a test suite and adds the information to the overall summary.
	 * Calling this is optional since recordResultsSummary will call it automatically,
	 * however if there are multiple suites with the same name, calling this explicitly can avoid
	 * getting them merged together.
	 * @param suiteName - the name of the suite. Used to group together related tests.
	 */
	public recordSuiteResults(suiteName: string): void {
		const results = this.inProgressSuites.get(suiteName);
		if (results === undefined) {
			// Omit tables for empty suites.
			// Empty Suites are common due to nesting of suites (a suite that contains only suites
			// is considered empty here),
			// so omitting them cleans up the output a lot.
			// Additionally some statistics (ex: geometricMean) can not be computed for empty suites.
			return;
		}

		// Remove suite from map so that other (non-concurrent) suites with the same name won't collide.
		this.inProgressSuites.delete(suiteName);

		const { benchmarksArray, table } = results;

		const disambiguatedSuiteName = results.disambiguationCounter
			? `${suiteName} (${results.disambiguationCounter})`
			: suiteName;

		// Output results from suite
		console.log(`\n${chalk.bold(disambiguatedSuiteName)}`);
		const filenameFull: string = this.writeCompletedBenchmarks(
			disambiguatedSuiteName,
			benchmarksArray,
		);
		console.log(`Results file: ${filenameFull}`);
		console.log(`${table.toString()}`);

		// Accumulate data for overall summary
		this.accumulateBenchmarkData(disambiguatedSuiteName, benchmarksArray);
	}

	/**
	 * Accumulates benchmark data for a suite and logs it to the console.
	 */
	private accumulateBenchmarkData(
		suiteName: string,
		benchmarksArray: readonly NamedResult[],
	): void {
		// Accumulate totals for suite
		let sumRuntime = 0;
		let countSuccessful = 0;
		let countFailure = 0;
		const geometricMeanProductValues: number[] = [];

		for (const { result } of benchmarksArray) {
			if (isResultError(result)) {
				countFailure++;
			} else {
				sumRuntime += result.elapsedSeconds;
				countSuccessful++;
				const primary = result.data.primary;
				geometricMeanProductValues.push(
					// Geometric mean may end up as NaN or infinity depending on questionable values passing through here (like when this divides by 0).
					// Such results do about as good of job at conveying the situation as is practical: for once the floating point edge cases do something we like.
					primary.type === ValueType.SmallerIsBetter ? primary.value : 1 / primary.value,
				);
			}
		}

		// Add row to overallSummaryTable
		let statusSymbol: string;
		switch (benchmarksArray.length) {
			case countSuccessful: {
				statusSymbol = chalk.green("✔");
				break;
			}
			case countFailure: {
				statusSymbol = chalk.red("×");
				break;
			}
			default: {
				statusSymbol = chalk.yellow("!");
			}
		}
		this.overallSummaryTable.cell("status", pad(4) + statusSymbol);
		this.overallSummaryTable.cell("suite name", chalk.italic(suiteName));
		this.overallSummaryTable.cell(
			"# of passed tests",
			`${countSuccessful} out of ${benchmarksArray.length}`,
			Table.padLeft,
		);
		this.overallSummaryTable.cell(
			"total time (s)",
			`${prettyNumber(sumRuntime, 1)}`,
			Table.padLeft,
		);
		this.overallSummaryTable.cell(
			"geometric mean of primary measurement (smaller is better)",
			`${prettyNumber(geometricMean(geometricMeanProductValues))}`,
			Table.padLeft,
		);
		this.overallSummaryTable.newRow();

		// Update accumulators for overall totals
		this.totalBenchmarkCount += benchmarksArray.length;
		this.totalSuccessfulBenchmarkCount += countSuccessful;
		this.totalSumRuntimeSeconds += sumRuntime;
		this.totalGeometricMeanProductValues.push(...geometricMeanProductValues);
	}

	/**
	 * Logs the overall summary (aggregating all suites) and saves it to disk.
	 * This will also record any pending suites.
	 */
	public recordResultsSummary(): void {
		for (const [key] of this.inProgressSuites) {
			this.recordSuiteResults(key);
		}

		const countFailure: number = this.totalBenchmarkCount - this.totalSuccessfulBenchmarkCount;
		this.overallSummaryTable.cell("suite name", "total");
		this.overallSummaryTable.cell(
			"# of passed tests",
			`${this.totalSuccessfulBenchmarkCount} out of ${this.totalBenchmarkCount}`,
			Table.padLeft,
		);
		this.overallSummaryTable.cell(
			"total time (s)",
			`${prettyNumber(this.totalSumRuntimeSeconds, 1)}`,
			Table.padLeft,
		);
		this.overallSummaryTable.cell(
			"geometric mean of primary measurement (smaller is better)",
			`${prettyNumber(geometricMean(this.totalGeometricMeanProductValues))}`,
			Table.padLeft,
		);
		this.overallSummaryTable.newRow();
		console.log(`\n\n${chalk.bold("Overall summary")}`);
		console.log(`\n${this.overallSummaryTable.toString()}`);
		if (countFailure > 0) {
			console.log(
				`* ${countFailure} benchmark${
					countFailure > 1 ? "s" : ""
				} failed. This will skew the geometric mean.`,
			);
		}
	}

	private writeCompletedBenchmarks(
		suiteName: string,
		benchmarks: readonly NamedResult[],
	): string {
		// Use the suite name as a filename, but first replace non-alphanumerics with underscores.
		// TODO: this could collide if suites different only by non-alphanumeric characters.
		// Detection and.or mitigation for this case would ideally be done here.
		const suiteNameEscaped: string = suiteName.replace(/[^\da-z]/gi, "_");
		const benchmarkArray: ReportEntry[] = [];
		const names = new Set<string>();
		for (const { name, result } of benchmarks) {
			if (names.has(name)) {
				// eslint-disable-next-line no-console
				console.warn(
					chalk.yellow(
						`Warning: multiple benchmarks with the name "${name}" is in suite "${suiteName}". This may cause confusion when analyzing results.`,
					),
				);
			}
			names.add(name);
			if (!isResultError(result)) {
				benchmarkArray.push(this.outputFriendlyObjectFromBenchmark(name, result));
			}
		}
		const outputContentString: string = JSON.stringify(
			{ suiteName, benchmarks: benchmarkArray } satisfies ReportFormat,
			undefined,
			4,
		);

		// If changing this or the result file logic in general,
		// be sure to update the glob used to look for output files in the perf pipeline.
		const outputFilename = `${suiteNameEscaped}_perfresult.json`;
		const fullPath: string = path.join(this.outputDirectory, outputFilename);
		fs.writeFileSync(fullPath, outputContentString);
		return fullPath;
	}

	/**
	 * The Benchmark object contains a lot of data we don't need and also has vague names, so
	 * this method extracts the necessary data and provides friendlier names.
	 */
	private outputFriendlyObjectFromBenchmark(
		benchmarkName: string,
		benchmark: BenchmarkData,
	): ReportEntry {
		const benchMarkOutput = {
			benchmarkName,
			elapsedSeconds: benchmark.elapsedSeconds,
			data: benchmark.data,
		};

		return benchMarkOutput;
	}
}

/**
 * A single benchmark result entry in the report.
 * @public
 */
export interface ReportEntry extends BenchmarkData {
	readonly benchmarkName: string;
}

/**
 * The type which is Json serialized and written to disk for each benchmark result.
 * @remarks
 * This only includes passing tests.
 * @public
 */
export interface ReportFormat {
	readonly suiteName: string;
	readonly benchmarks: readonly ReportEntry[];
}
