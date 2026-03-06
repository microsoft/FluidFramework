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
	type BenchmarkResult,
	type CollectedData,
} from "./ResultTypes.js";
import { formatMeasurementValue, geometricMean, pad, prettyNumber } from "./RunnerUtilities.js";
import { assert } from "./assert.js";
import { testDurationName } from "./ResultUtilities.js";

/**
 * A node in the suite tree maintained by {@link BenchmarkReporter}.
 * Each node corresponds to one mocha `describe` block.
 */
interface SuiteNode {
	/**
	 * The local (non-prefixed) title of this suite — the string passed to `describe()`.
	 * Used as the `suiteName` in JSON output.
	 */
	readonly localName: string;
	readonly table: Table;
	/**
	 * Direct test results and child suite nodes in event-arrival order.
	 * This is the authoritative ordered contents of the suite for both console and JSON output.
	 */
	readonly children: (SuiteNode | NamedResult)[];
}

interface NamedResult {
	readonly name: string;
	readonly result: BenchmarkResult;
}

function isSuiteNode(item: SuiteNode | NamedResult): item is SuiteNode {
	return "table" in item;
}

/**
 * Collects and formats performance data for a sequence of suites of benchmarks.
 * Data must be provided in the form of one {@link CollectedData} for each test in each suite.
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
	 * Stack of the currently open suites nodes (most-recently-opened at the end).
	 * Index 0 holds a special root that holds top-level content.
	 * Pushed by {@link BenchmarkReporter.beginSuite} and popped by {@link BenchmarkReporter.recordSuiteResults}.
	 */
	private readonly suiteStack: SuiteNode[] = [
		{ localName: "root", table: new Table(), children: [] },
	];

	private totalSumRuntimeSeconds = 0;
	private totalBenchmarkCount = 0;
	private totalSuccessfulBenchmarkCount = 0;
	private totalGeometricMeanProductValues: number[] = [];

	private readonly outputFilePath: string | undefined;

	/**
	 * @param outputFilePath - path to write the combined results JSON file to.
	 * If not provided, no file is written.
	 */
	public constructor(outputFilePath?: string) {
		this.outputFilePath = outputFilePath ? path.resolve(outputFilePath) : undefined;
	}

	/**
	 * Registers the start of a suite and pushes it onto the stack.
	 * Must be called before any {@link BenchmarkReporter.recordTestResult} calls for tests in the suite,
	 * and must be paired with a matching {@link BenchmarkReporter.recordSuiteResults} call.
	 * When using mocha, call this from `EVENT_SUITE_BEGIN`.
	 *
	 * @param localName - the local `suite.title` string (tags stripped), used in JSON output.
	 */
	public beginSuite(localName: string): void {
		const node: SuiteNode = {
			localName,
			table: new Table(),
			children: [],
		};

		// Always attach to the current stack top (virtual root is always present).
		this.suiteStack.at(-1)!.children.push(node);
		this.suiteStack.push(node);
	}

	/**
	 * Appends a benchmark result to the currently open suite (the stack top).
	 */
	public recordTestResult(testName: string, result: BenchmarkResult): void {
		// Non-null assertion is safe: suiteStack always has at least the virtual root.
		const node = this.suiteStack.at(-1)!;

		const { table, children } = node;

		const namedResult: NamedResult = { name: testName, result };
		children.push(namedResult);

		if (isResultError(result)) {
			table.cell("status", `${pad(4)}${chalk.red("×")}`);
		} else {
			table.cell("status", `${pad(4)}${chalk.green("✔")}`);
		}

		table.cell("name", chalk.italic(testName));

		if (isResultError(result)) {
			table.cell("error", result.error);
		} else {
			for (const measurement of result) {
				const text = formatMeasurementValue(measurement);
				const final =
					measurement.significance === "Primary"
						? chalk.bold(text)
						: measurement.significance === "Diagnostic"
						? chalk.dim(text)
						: text;
				table.cell(measurement.name, final, Table.padLeft);
			}
		}

		table.newRow();
	}

	/**
	 * Marks the current suite (stack top) as complete, prints its console table, and accumulates summary stats.
	 * Calling this is optional since {@link BenchmarkReporter.recordResultsSummary} will call it automatically
	 * for any remaining open suites.
	 */
	public recordSuiteResults(): void {
		// Never pop the root suite.
		assert(
			this.suiteStack.length > 1,
			"recordSuiteResults called without a matching beginSuite",
		);

		const path = this.suiteStack
			.slice(1)
			.map((s) => s.localName)
			.join(" / ");

		// Non-null assertion is safe: we just checked length > 1.
		const node = this.suiteStack.pop()!;

		// Only output and accumulate stats for suites with direct benchmarks.
		const directBenchmarks = node.children.filter((c): c is NamedResult => !isSuiteNode(c));
		if (directBenchmarks.length > 0) {
			console.log(`${chalk.bold(path)}`);
			console.log(`${node.table.toString()}`);
			this.accumulateBenchmarkData(path, directBenchmarks);
		}
	}

	/**
	 * Accumulates benchmark data for a suite and logs it to the overall summary table.
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
				const elapsedDiagnostic = result.find((m) => m.name === testDurationName);
				sumRuntime += elapsedDiagnostic?.value ?? 0;
				countSuccessful++;
				for (const measurement of result) {
					if (measurement.significance === "Primary") {
						geometricMeanProductValues.push(
							// Geometric mean may end up as NaN or infinity depending on questionable values passing through here (like when this divides by 0).
							// Such results do about as good of job at conveying the situation as is practical: for once the floating point edge cases do something we like.
							measurement.type === ValueType.SmallerIsBetter
								? measurement.value
								: 1 / measurement.value,
						);
					}
				}
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
			geoMeanColumn,
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
	 * Logs the overall summary (aggregating all suites) and saves the results to disk.
	 * This will also close any suites that were not explicitly closed.
	 */
	public recordResultsSummary(): void {
		assert(
			this.suiteStack.length === 1,
			"all suites should be closed except root when calling recordResultsSummary",
		);

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
			geoMeanColumn,
			`${prettyNumber(geometricMean(this.totalGeometricMeanProductValues))}`,
			Table.padLeft,
		);
		this.overallSummaryTable.newRow();
		console.log(`\n${chalk.bold("Overall summary")}`);
		console.log(`${this.overallSummaryTable.toString()}`);
		if (countFailure > 0) {
			console.log(
				`* ${countFailure} benchmark${
					countFailure > 1 ? "s" : ""
				} failed. This will skew the geometric mean.`,
			);
		}

		if (this.outputFilePath !== undefined) {
			// Build the report from the root's children.
			const root = suiteChildrenToReportSuite(this.suiteStack[0].children);
			const outputDir = path.dirname(this.outputFilePath);
			fs.mkdirSync(outputDir, { recursive: true });
			fs.writeFileSync(this.outputFilePath, JSON.stringify(root, undefined, 4));
			console.log(`Results file: ${this.outputFilePath}`);
		}
	}
}

const geoMeanColumn = "primary measurement geometric mean (smaller is better)";

/**
 * Recursively converts a suite node into a {@link ReportSuite} for JSON output.
 * Returns undefined if the node (and all its descendants) contain no reportable content.
 */
function suiteNodeToReportSuite(node: SuiteNode): ReportSuite | undefined {
	const contents = suiteChildrenToReportSuite(node.children);
	if (contents.length === 0) return undefined;
	return { suiteName: node.localName, contents };
}

/**
 * Recursively converts a array of suite children into a {@link ReportArray} for JSON output.
 */
function suiteChildrenToReportSuite(children: readonly (SuiteNode | NamedResult)[]): ReportArray {
	const contents: (ReportSuite | ReportEntry)[] = [];
	for (const child of children) {
		if (isSuiteNode(child)) {
			const childSuite = suiteNodeToReportSuite(child);
			if (childSuite !== undefined) {
				contents.push(childSuite);
			}
		} else {
			if (!isResultError(child.result)) {
				contents.push(outputFriendlyObjectFromBenchmark(child.name, child.result));
			}
		}
	}
	return contents;
}

/**
 * The Benchmark object contains a lot of data we don't need and also has vague names, so
 * this method extracts the necessary data and provides friendlier names.
 */
function outputFriendlyObjectFromBenchmark(
	benchmarkName: string,
	data: CollectedData,
): ReportEntry {
	return { benchmarkName, data };
}

/**
 * A single benchmark result entry in the report.
 * @public
 */
export interface ReportEntry {
	readonly benchmarkName: string;
	readonly data: CollectedData;
}

/**
 * A suite containing benchmark results and/or child suites.
 * @remarks
 * This only includes passing tests.
 * When using mocha, this corresponds to the contents of a describe block,
 * which may include both it blocks and nested describe blocks.
 * @public
 */
export interface ReportSuite {
	readonly suiteName: string;
	readonly contents: ReportArray;
}

/**
 * The type which is Json serialized and written to disk for a test suite.
 * @remarks
 * This only includes passing tests, and suites which were non-empty.
 * When using mocha, this corresponds to the contents of a describe block,
 * which may include both it blocks and nested describe blocks.
 * @public
 */
export type ReportArray = readonly (ReportSuite | ReportEntry)[];
