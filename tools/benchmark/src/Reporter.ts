/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file is a reporter used with node, so depending on node is fine.
/* eslint-disable import-x/no-nodejs-modules */

/* eslint no-console: ["error", { allow: ["log","error"] }] */
import * as fs from "node:fs";

import chalk from "chalk";
import Table from "easy-table";

import { isResultError, ValueType, type BenchmarkResult } from "./ResultTypes.js";
import { formatMeasurementValue, geometricMean, prettyNumber } from "./RunnerUtilities.js";
import { testDurationName } from "./ResultUtilities.js";
import { getName, isChildProcess } from "./Configuration.js";

function isSuiteNode(item: ReportSuite | ReportEntry): item is ReportSuite {
	return "contents" in item;
}

/**
 * Appends a benchmark result to the currently open suite (the stack top).
 */
export function recordTestResult(parent: ReportPath, entry: ReportEntry): void {
	if (isChildProcess) {
		// It is common to suppress console.log in test environments.
		// Since this output is not to the user facing console, but for internal data transfer,
		// write it directly to stdout to ensure it makes it to the parent process regardless of console.log configuration.
		process.stdout.write(`\n${JSON.stringify(entry.data)}\n`);
		return;
	}

	if (isResultError(entry.data)) {
		console.error(
			chalk.red(
				`\nTest ${JSON.stringify(fullName(parent, entry.benchmarkName))} failed:\n    ${
					entry.data.error
				}\n`,
			),
		);
	}
}

const geoMeanColumn = "primary measurement geometric mean (smaller is better)";

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

export interface ReportPath {
	readonly report: Pick<ReportSuite, "suiteName">;
	readonly parent?: ReportPath;
}

export interface ReportSuiteWithPath extends ReportPath {
	readonly report: ReportSuite;
	readonly parent?: ReportPath;
}

function suiteNames(parent: ReportPath): string[] {
	const names: string[] = [];
	let current: ReportPath | undefined = parent;
	while (current !== undefined) {
		names.push(current.report.suiteName);
		current = current.parent;
	}
	return names.reverse();
}

function fullName(parent: ReportPath, benchmarkName?: string): string {
	const names = suiteNames(parent);
	if (benchmarkName !== undefined) {
		names.push(benchmarkName);
	}
	return names.join(" / ");
}

function visitSuites(
	reportParent: ReportSuiteWithPath,
	callback: (reportParent: ReportSuiteWithPath) => void,
): void {
	callback(reportParent);
	visitSuitesArray(reportParent, reportParent.report.contents, callback);
}

function visitSuitesArray(
	parent: ReportPath | undefined,
	array: ReportArray,
	callback: (reportParent: ReportSuiteWithPath) => void,
): void {
	for (const content of array) {
		if (isSuiteNode(content)) {
			visitSuites({ report: content, parent }, callback);
		}
	}
}

/**
 * The type that is JSON-serialized and written to disk for a test suite.
 * @remarks
 * This only includes non-empty suites.
 * When using mocha, this corresponds to the contents of a describe block,
 * which may include both it blocks and nested describe blocks.
 * @public
 */
export type ReportArray = (ReportSuite | ReportEntry)[];

export function reportTable(heading: string, reports: readonly ReportEntry[]): string {
	const table = new Table();

	// Accumulate totals for suite
	const stats = getShallowStats(reports);

	for (const report of reports) {
		const result = report.data;
		const name = chalk.italic(getName(report.benchmarkName));
		if (isResultError(result)) {
			table.cell("Status", status(0, 1));
			table.cell("Name", name);
			// Full error should be included outside of table, so limit text in table to avoid breaking formatting.
			const errorColumns = 50;
			const message =
				result.error.length > errorColumns
					? `${result.error.slice(0, errorColumns - 1)}…`
					: result.error;
			table.cell("Error", chalk.red(message));
		} else {
			table.cell("Status", status(1, 0));
			table.cell("Name", name);
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

	table.cell("Status", status(stats.countSuccessful, stats.countFailure));
	table.cell("Name", "Total");
	table.cell(
		testDurationName,
		`${formatMeasurementValue({ value: stats.sumRuntime, units: "seconds" })}`,
		Table.padLeft,
	);

	table.newRow();

	return `${chalk.bold(heading)}\n${table.toString()}`;
}

function status(passing: number, failing: number): string {
	const mark =
		failing === 0 ? chalk.green("✔") : passing === 0 ? chalk.red("×") : chalk.yellow("!");
	return `  ${mark}`;
}

/**
 * If suite has direct tests, log them in a table.
 */
export function logSuiteTests(reportParent: ReportSuiteWithPath): void {
	if (isChildProcess) {
		// Child process tests report their output via recordTestResult.
		return;
	}

	const directBenchmarks = reportParent.report.contents.filter(
		(c): c is ReportEntry => !isSuiteNode(c),
	);

	if (directBenchmarks.length > 0) {
		console.log(reportTable(fullName(reportParent), directBenchmarks));
	}
}

function getShallowStats(reports: Readonly<ReportArray>) {
	// Accumulate totals for suite
	let sumRuntime = 0;
	let countSuccessful = 0;
	let countFailure = 0;
	const geometricMeanProductValues: number[] = [];

	for (const report of reports) {
		if (isSuiteNode(report)) {
			continue;
		}
		const result = report.data;
		if (isResultError(result)) {
			countFailure++;
		} else {
			countSuccessful++;
			for (const measurement of result) {
				if (measurement.significance === "Primary") {
					geometricMeanProductValues.push(
						// Geometric mean may end up as NaN or infinity for questionable values (e.g. when this divides by 0).
						// Such results do about as good a job conveying the situation as is practical: for once, the floating-point edge cases do something we like.
						measurement.type === ValueType.SmallerIsBetter
							? measurement.value
							: 1 / measurement.value,
					);
				}
				if (measurement.name === testDurationName) {
					sumRuntime += measurement.value;
				}
			}
		}
	}

	return { sumRuntime, countSuccessful, countFailure, geometricMeanProductValues };
}

export function generateOverallSummary(content: ReportArray, parent?: ReportPath): string {
	const table = new Table();

	// Accumulate totals for suite
	let sumRuntime = 0;
	let countSuccessful = 0;
	let countFailure = 0;
	const geometricMeanProductValues: number[] = [];

	visitSuitesArray(parent, content, (reports) => {
		const stats = getShallowStats(reports.report.contents);
		sumRuntime += stats.sumRuntime;
		countSuccessful += stats.countSuccessful;
		countFailure += stats.countFailure;
		geometricMeanProductValues.push(...stats.geometricMeanProductValues);
		table.cell("Status", status(stats.countSuccessful, stats.countFailure));
		table.cell("Name", fullName(reports));
		table.cell(
			testDurationName,
			`${formatMeasurementValue({ value: stats.sumRuntime, units: "seconds" })}`,
			Table.padLeft,
		);
		table.cell(
			geoMeanColumn,
			`${prettyNumber(geometricMean(stats.geometricMeanProductValues))}`,
			Table.padLeft,
		);
		table.newRow();
	});

	table.pushDelimeter();

	table.cell("Status", status(countSuccessful, countFailure));
	table.cell("Name", chalk.italic("Total"));
	table.cell(
		testDurationName,
		`${formatMeasurementValue({ value: sumRuntime, units: "seconds" })}`,
		Table.padLeft,
	);
	table.cell(
		geoMeanColumn,
		`${prettyNumber(geometricMean(geometricMeanProductValues))}`,
		Table.padLeft,
	);

	const title = parent === undefined ? "Overall Summary" : `Summary for ${fullName(parent)}`;

	const notes: string[] = [];
	if (countFailure > 0) {
		notes.push(
			`* ${countFailure} benchmark${
				countFailure > 1 ? "s" : ""
			} failed. This will skew the geometric mean.`,
		);
	}

	const mainOutput = `${chalk.bold(title)}\n${table.toString()}`;
	if (notes.length > 0) {
		return `${mainOutput}\n\n${notes.join("\n")}`;
	}
	return mainOutput;
}

/**
 *
 * @param reports - The full report data for the test run, including all suites and benchmarks.
 * @param incremental - If true, suites were already logged as they completed using {@link logSuiteTests}, so only print the overall summary here. If false, print all suites and the overall summary.
 * @param outputFilePath - The file path to write the results to. If undefined, results are not written to a file.
 */
export function onCompletion(
	reports: ReportArray,
	incremental: boolean,
	outputFilePath: string | undefined,
): void {
	if (isChildProcess) {
		// Child process tests report their output via recordTestResult.
		return;
	}

	if (!incremental) {
		visitSuitesArray(undefined, reports, (rp) => {
			logSuiteTests(rp);
		});
	}

	console.log(generateOverallSummary(reports, undefined));

	if (outputFilePath !== undefined) {
		fs.writeFileSync(outputFilePath, JSON.stringify(reports, undefined, "\t"));
		console.log(`Results file: ${outputFilePath}`);
	}
}
