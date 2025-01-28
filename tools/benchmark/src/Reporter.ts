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
/* eslint-disable import/no-nodejs-modules */

/* eslint-disable unicorn/prefer-module */

/* eslint no-console: ["error", { allow: ["log"] }] */
import * as fs from "node:fs";
import * as path from "node:path";

import chalk from "chalk";
import Table from "easy-table";

import { isResultError, type BenchmarkData, type BenchmarkResult } from "./ResultTypes";
import { pad, prettyNumber } from "./RunnerUtilities";

interface BenchmarkResults {
	table: Table;
	benchmarksMap: Map<string, Readonly<BenchmarkResult>>;
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

	private totalSumRuntimeSeconds = 0;
	private totalBenchmarkCount = 0;
	private totalSuccessfulBenchmarkCount = 0;

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
			results = {
				table: new Table(),
				benchmarksMap: new Map<string, Readonly<BenchmarkResult>>(),
			};
			this.inProgressSuites.set(suiteName, results);
		}

		const { table, benchmarksMap } = results;

		// Make sure to add properties that are not part of the `customData` object here.
		benchmarksMap.set(testName, result);
		if (isResultError(result)) {
			table.cell("status", `${pad(4)}${chalk.red("×")}`);
		} else {
			table.cell("status", `${pad(4)}${chalk.green("✔")}`);
		}

		table.cell("name", chalk.italic(testName));

		if (isResultError(result)) {
			table.cell("error", result.error);
		} else {
			table.cell("total time (s)", prettyNumber(result.elapsedSeconds, 2));

			const customData = result.customData;
			for (const [key, val] of Object.entries(customData)) {
				const displayValue = val.formattedValue;
				table.cell(key, displayValue, Table.padLeft);
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

		const { benchmarksMap, table } = results;

		// Output results from suite
		console.log(`\n${chalk.bold(suiteName)}`);
		const filenameFull: string = this.writeCompletedBenchmarks(suiteName, benchmarksMap);
		console.log(`Results file: ${filenameFull}`);
		console.log(`${table.toString()}`);

		// Accumulate data for overall summary
		this.accumulateBenchmarkData(suiteName, benchmarksMap);
	}

	/**
	 * Accumulates benchmark data for a suite and logs it to the console.
	 */
	private accumulateBenchmarkData(
		suiteName: string,
		benchmarksMap: Map<string, BenchmarkResult>,
	): void {
		// Accumulate totals for suite
		let sumRuntime = 0;
		let countSuccessful = 0;
		let countFailure = 0;

		for (const [, value] of benchmarksMap) {
			if (isResultError(value)) {
				countFailure++;
			} else {
				sumRuntime += value.elapsedSeconds;
				countSuccessful++;
			}
		}

		// Add row to overallSummaryTable
		let statusSymbol: string;
		switch (benchmarksMap.size) {
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
			`${countSuccessful} out of ${benchmarksMap.size}`,
			Table.padLeft,
		);
		this.overallSummaryTable.cell(
			"total time (s)",
			`${prettyNumber(sumRuntime, 1)}`,
			Table.padLeft,
		);
		this.overallSummaryTable.newRow();

		// Update accumulators for overall totals
		this.totalBenchmarkCount += benchmarksMap.size;
		this.totalSuccessfulBenchmarkCount += countSuccessful;
		this.totalSumRuntimeSeconds += sumRuntime;
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
		benchmarks: Map<string, Readonly<BenchmarkResult>>,
	): string {
		// Use the suite name as a filename, but first replace non-alphanumerics with underscores
		const suiteNameEscaped: string = suiteName.replace(/[^\da-z]/gi, "_");
		const benchmarkArray: unknown[] = [];
		for (const [key, bench] of benchmarks.entries()) {
			if (!isResultError(bench)) {
				const benchData = bench as BenchmarkData; // the if statement above guarantees the `bench` to be of type `BenchmarkData`.
				benchmarkArray.push(this.outputFriendlyObjectFromBenchmark(key, benchData));
			}
		}
		const outputContentString: string = JSON.stringify(
			{ suiteName, benchmarks: benchmarkArray },
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
	): Record<string, unknown> {
		const customData: Record<string, unknown> = {};

		// As the name suggests, `customData` should only contain custom data that are specific to the benchmark test.
		// If there are any other properties that are global to the benchmark test (e.g., `elapsedSeconds`), they should be added in the `benchMarkOutput` object.
		for (const [key, value] of Object.entries(benchmark.customData)) {
			customData[key] = value.rawValue;
		}

		const benchMarkOutput = {
			benchmarkName,
			elapsedSeconds: benchmark.elapsedSeconds,
			customData,
		};

		return benchMarkOutput;
	}
}
