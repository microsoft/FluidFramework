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

import {
	isResultError,
	isSuiteNode,
	ValueType,
	type Measurement,
	type ReportArray,
	type ReportEntry,
	type ReportSuite,
} from "./reportTypes.js";
import { testDurationName } from "./benchmarkAuthoringUtilities.js";
import { getName, isChildProcess } from "./Configuration.js";
import { assert } from "./assert.js";

/**
 * Reporters should call this when they observe a test being finished.
 * @remarks
 * The reporter must also add the `entry` to the proper {@link ReportArray}.
 * @public
 */
export function recordTestResult(parent: ReportPath | undefined, entry: ReportEntry): void {
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
 * A linked-list node representing the ancestry of a suite in the report tree.
 * @public
 */
export interface ReportPath {
	readonly report: Pick<ReportSuite, "suiteName">;
	readonly parent?: ReportPath;
}

/**
 * A {@link ReportPath} node whose {@link ReportPath.report} is a full {@link ReportSuite}.
 * @public
 */
export interface ReportSuiteWithPath extends ReportPath {
	readonly report: ReportSuite;
	readonly parent?: ReportPath;
}

/**
 * A {@link ReportArray} with an associated {@link ReportPath} representing its position in some hierarchy.
 * @remarks
 * This is like a {@link ReportSuiteWithPath}, except it does not require the top level content array to be part of a suite.
 * @public
 */
export interface SuiteData {
	content: ReportArray;
	parent?: ReportPath;
}

function suiteNames(parent: ReportPath | undefined): string[] {
	const names: string[] = [];
	let current: ReportPath | undefined = parent;
	while (current !== undefined) {
		names.push(current.report.suiteName);
		current = current.parent;
	}
	return names.reverse();
}

function fullName(parent: ReportPath | undefined, benchmarkName?: string): string {
	const names = suiteNames(parent);
	if (benchmarkName !== undefined) {
		names.push(benchmarkName);
	}
	return names.join(" / ");
}

/**
 * Walk the `report` and apply `callback` to each suite in the tree, including the root suite represented by `report` itself.
 * @public
 */
export function visitSuitesArray(report: SuiteData, callback: (data: SuiteData) => void): void {
	callback(report);
	for (const content of report.content) {
		if (isSuiteNode(content)) {
			visitSuitesArray(
				{ content: content.contents, parent: { report: content, parent: report.parent } },
				callback,
			);
		}
	}
}

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
	table.cell(
		"Name",
		`Total (${stats.countSuccessful} of ${stats.countSuccessful + stats.countFailure} passing)`,
	);
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
 * If suite has direct tests, format them into a table.
 * @public
 */
export function formatResultArrayTable(data: SuiteData): string | undefined {
	const directBenchmarks = data.content.filter((c): c is ReportEntry => !isSuiteNode(c));

	if (directBenchmarks.length === 0) {
		return undefined;
	}
	return reportTable(fullName(data.parent), directBenchmarks);
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

/**
 * Formats a summary table for the entire suite hierarchy, including subtotals for each suite and an overall total.
 * @remarks
 * Includes notes about the results if applicable (e.g. if there were any failures).
 */
export function formatOverallSummary(data: SuiteData): string {
	const table = new Table();

	// Accumulate totals for suite
	let sumRuntime = 0;
	let countSuccessful = 0;
	let countFailure = 0;
	const geometricMeanProductValues: number[] = [];

	visitSuitesArray(data, (innerData) => {
		const stats = getShallowStats(innerData.content);
		if (stats.countSuccessful + stats.countFailure === 0) {
			// Don't include suites with no direct benchmarks in the table.
			return;
		}
		sumRuntime += stats.sumRuntime;
		countSuccessful += stats.countSuccessful;
		countFailure += stats.countFailure;
		geometricMeanProductValues.push(...stats.geometricMeanProductValues);
		table.cell("Status", status(stats.countSuccessful, stats.countFailure));
		table.cell("Suite Name", fullName(innerData.parent));
		table.cell(
			"# of passed tests",
			`${stats.countSuccessful} out of ${stats.countSuccessful + stats.countFailure}`,
			Table.padLeft,
		);
		table.cell(
			`Suite ${testDurationName}`,
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

	table.cell("Status", status(countSuccessful, countFailure));
	table.cell("Suite Name", "Total");
	table.cell(
		"# of passed tests",
		`${countSuccessful} out of ${countSuccessful + countFailure}`,
		Table.padLeft,
	);
	table.cell(
		`Suite ${testDurationName}`,
		`${formatMeasurementValue({ value: sumRuntime, units: "seconds" })}`,
		Table.padLeft,
	);
	table.cell(
		geoMeanColumn,
		`${prettyNumber(geometricMean(geometricMeanProductValues))}`,
		Table.padLeft,
	);

	table.newRow();

	const title =
		data.parent === undefined ? "Overall Summary" : `Summary for ${fullName(data.parent)}`;

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
 * Reporters should call this when all benchmark tests have completed to log a summary and optionally write results to disk.
 * @param reports - The full report data for the test run, including all suites and benchmarks.
 * @param incremental - If true, suites were already logged as they completed using {@link formatResultArrayTable}, so only print the overall summary here. If false, print all suites and the overall summary.
 * @param outputFilePath - The file path to write the results to. If undefined, results are not written to a file.
 * @public
 */
export function finishLoggingReport(
	reports: SuiteData,
	incremental: boolean,
	outputFilePath: string | undefined,
): void {
	if (!incremental) {
		visitSuitesArray(reports, (data) => {
			const text = formatResultArrayTable(data);
			if (text !== undefined) {
				console.log(text);
			}
		});
	}

	console.log(formatOverallSummary(reports));

	if (outputFilePath !== undefined) {
		fs.writeFileSync(outputFilePath, JSON.stringify(reports.content, undefined, "\t"));
		console.log(`Results file: ${outputFilePath}`);
	}
}

/**
 * Nicely format a decimal number to make it human-readable.
 * @param num - Number to format
 * @param numDecimals - Number of digits after the decimal point to retain
 */
export function prettyNumber(num: number, numDecimals = 3): string {
	// Split the string to determine parts before and after the decimal
	const split: string[] = num.toFixed(numDecimals).split(".");
	// Show exponential if we have more than 9 digits before the decimal
	if (split[0].length > 9) {
		return num.toExponential(numDecimals);
	}
	// Add commas to the numbers before the decimal.
	// Since this only ever runs on <= 9 characters, it's not a performance problem.
	split[0] = split[0].replace(/(\d)(?=(\d{3})+$)/g, "$1,");
	return split.join(".");
}

/**
 * Computes the geometric mean of a set of values.
 * @remarks
 * Returns 0 if any value is non-positive.
 * Returns NaN if `values` is empty.
 * @param values - The values to compute the geometric mean of.
 */
export function geometricMean(values: number[]): number {
	// Compute the geometric mean of values, but do it using log and exp to reduce overflow/underflow.
	let sum = 0;
	for (const value of values) {
		if (value <= 0) {
			// In this context, smaller numbers are considered better, and 0 is infinitely good
			// (drowns out all other data from the entire geometric mean).
			// A negative value is thus better than infinitely good, which we can approximate as infinitely good,
			// and thus 0.
			// Generally, tests should not produce 0 if they want to use the geometric mean for anything,
			// but we don't have a simple way to know if the user cares about the geometric mean,
			// nor a way to know if 0 or negative values are valid.
			// Thus, for now, we cap the geometric mean at 0 for these cases to ensure negative values don't produce a seemingly meaningful but actually misleading result.
			// As this happens at the end of an often very slow data collection,
			// we really don't want to throw here and lose that data, which contains everything the user would need to see why the geometric mean is 0.
			return 0;
		}
		sum += Math.log(value);
	}
	return Math.exp(sum / values.length);
}

/**
 * Formats a measurement for display, including appropriate units and number formatting.
 * @remarks
 * Special-cases several well-known units.
 * @param measurement - The measurement to format.
 */
export function formatMeasurementValue(
	measurement: Pick<Measurement, "value" | "units">,
	scaleUnits: boolean = true,
): string {
	if (measurement.units === "count") {
		assert(Number.isInteger(measurement.value), "expected integer value for count measurement");
		return `${prettyNumber(measurement.value, 0)}`;
	}
	if (measurement.units === "bytes") {
		// For bytes, use binary prefixes
		const units = ["B", "KiB", "MiB", "GiB", "TiB"];
		let value = measurement.value;
		let unitIndex = 0;
		while (scaleUnits && Math.abs(value) >= 1024 && unitIndex < units.length - 1) {
			value /= 1024;
			unitIndex++;
		}
		return `${prettyNumber(value, 2)} ${units[unitIndex]}`;
	}
	if (measurement.units === "%") {
		return `${prettyNumber(measurement.value, 3)}%`;
	}
	if (measurement.units === "ns/op") {
		return scaleUnits
			? `${formatNanosecondDuration(measurement.value)}/op`
			: `${prettyNumber(measurement.value, 1)} ns/op`;
	}
	if (measurement.units === "seconds") {
		return scaleUnits
			? `${formatNanosecondDuration(measurement.value * 1e9)}`
			: `${prettyNumber(measurement.value, 3)} s`;
	}

	return `${prettyNumber(measurement.value)}${measurement.units ? ` ${measurement.units}` : ""}`;
}

/**
 * Formats a duration in nanoseconds for display, including appropriate units and number formatting.
 * @param nanoseconds - The duration in nanoseconds to format.
 */
export function formatNanosecondDuration(nanoseconds: number): string {
	const units = ["ns", "ms", "s"];
	// Scaling factors between the above units
	const scale = [1e6, 1e3];
	let value = nanoseconds;
	let unitIndex = 0;
	while (Math.abs(value) >= scale[unitIndex] && unitIndex < units.length - 1) {
		value /= scale[unitIndex];
		unitIndex++;
	}
	const decimals = Math.abs(value) > 1000 ? 0 : 2;
	return `${prettyNumber(value, decimals)} ${units[unitIndex]}`;
}
