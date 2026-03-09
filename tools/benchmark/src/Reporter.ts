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
	type ReportArray,
	type ReportEntry,
	type ReportSuite,
} from "./ResultTypes.js";
import { formatMeasurementValue, geometricMean, prettyNumber } from "./RunnerUtilities.js";
import { testDurationName } from "./ResultUtilities.js";
import { getName, isChildProcess } from "./Configuration.js";

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
