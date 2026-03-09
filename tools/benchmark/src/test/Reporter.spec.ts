/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { strict as assert } from "node:assert";
import chalk from "chalk";

import {
	formatOverallSummary,
	finishLoggingReport,
	recordTestResult,
	reportTable,
	type ReportPath,
} from "../Reporter.js";
import {
	parseReport,
	ValueType,
	type CollectedData,
	type ReportArray,
	type ReportEntry,
} from "../ResultTypes.js";

// A minimal passing CollectedData result.
const successData: CollectedData = [
	{
		name: "duration",
		value: 1.5,
		units: "ns/op",
		type: ValueType.SmallerIsBetter,
		significance: "Primary",
	},
];

const successEntry: ReportEntry = { benchmarkName: "passing test", data: successData };
const errorEntry: ReportEntry = {
	benchmarkName: "Example Failing Test",
	data: { error: "Example Error Text" },
};

describe("Reporter", () => {
	// Disable chalk colors so assertions can match plain strings.
	let originalChalkLevel: chalk.Level;
	before(() => {
		originalChalkLevel = chalk.level;
		chalk.level = 0;
	});
	after(() => {
		chalk.level = originalChalkLevel;
	});

	describe("reportTable", () => {
		it("includes the heading", () => {
			const result = reportTable("My Suite", [successEntry]);
			assert.match(result, /My Suite/);
		});

		it("includes benchmark names for passing tests", () => {
			const result = reportTable("Suite", [successEntry]);
			assert.match(result, /passing test/);
		});

		it("includes benchmark names and error message for failing tests", () => {
			const result = reportTable("Suite", [errorEntry]);
			assert.match(result, /Example Failing Test/);
			assert.match(result, /Example Error Text/);
		});

		it("totals row shows correct pass/fail counts", () => {
			const result = reportTable("Suite", [successEntry, errorEntry]);
			assert.match(result, /1 of 2 passing/);
		});

		it("totals row shows all passing when no errors", () => {
			const result = reportTable("Suite", [successEntry]);
			assert.match(result, /1 of 1 passing/);
		});

		it("includes measurement values for passing tests", () => {
			const result = reportTable("Suite", [successEntry]);
			assert.match(result, /1\.50 ns\/op/);
			assert.match(result, /duration/);
		});
	});

	describe("generateOverallSummary", () => {
		it('includes "Overall Summary" title when no parent is given', () => {
			const content: ReportArray = [{ suiteName: "MySuite", contents: [successEntry] }];
			const result = formatOverallSummary({ content });
			assert.match(result, /Overall Summary/);
		});

		it("includes a custom title when a parent is given", () => {
			const parent: ReportPath = { report: { suiteName: "Outer" } };
			const content: ReportArray = [successEntry];
			const result = formatOverallSummary({ content, parent });
			assert.match(result, /Summary for Outer/);
		});

		it("includes suite names in the summary table", () => {
			const content: ReportArray = [{ suiteName: "BenchSuite", contents: [successEntry] }];
			const result = formatOverallSummary({ content });
			assert.match(result, /BenchSuite/);
		});

		it("includes pass count in the summary table", () => {
			const content: ReportArray = [
				{ suiteName: "Suite", contents: [successEntry, errorEntry] },
			];
			const result = formatOverallSummary({ content });
			assert.match(result, /1 out of 2/);
		});

		it("appends a failure note when there are failing benchmarks", () => {
			const content: ReportArray = [{ suiteName: "Suite", contents: [errorEntry] }];
			const result = formatOverallSummary({ content });
			assert.match(result, /1 benchmark failed/);
		});

		it("uses plural 'benchmarks' when multiple failures", () => {
			const errorEntry2: ReportEntry = {
				benchmarkName: "another failure",
				data: { error: "also bad" },
			};
			const content: ReportArray = [
				{ suiteName: "Suite", contents: [errorEntry, errorEntry2] },
			];
			const result = formatOverallSummary({ content });
			assert.match(result, /2 benchmarks failed/);
		});

		it("omits failure note when all benchmarks pass", () => {
			const content: ReportArray = [{ suiteName: "Suite", contents: [successEntry] }];
			const result = formatOverallSummary({ content });
			assert.doesNotMatch(result, /failed/);
		});

		it("includes a Total row", () => {
			const content: ReportArray = [{ suiteName: "Suite", contents: [successEntry] }];
			const result = formatOverallSummary({ content });
			assert.match(result, /Total/);
		});

		it("handles nested suites by visiting each level", () => {
			const nested: ReportArray = [
				{
					suiteName: "Outer",
					contents: [
						{
							suiteName: "Inner",
							contents: [successEntry],
						},
					],
				},
			];
			const result = formatOverallSummary({ content: nested });
			// outer suite name
			assert.match(result, /Outer/);
			// inner suite name
			assert.match(result, /Inner/);
		});
	});

	describe("recordTestResult", () => {
		function captureConsoleErrors(fn: () => void): string[] {
			const original = console.error;
			const errors: string[] = [];
			console.error = (...args: unknown[]) => errors.push(args.join(" "));
			try {
				fn();
			} finally {
				console.error = original;
			}
			return errors;
		}

		it("calls console.error for error results", () => {
			const errors = captureConsoleErrors(() => recordTestResult(undefined, errorEntry));
			assert(errors.length > 0);
			assert(errors.some((e) => e.includes("Example Error Text")));
		});

		it("does not call console.error for success results", () => {
			const errors = captureConsoleErrors(() => recordTestResult(undefined, successEntry));
			assert.deepEqual(errors, []);
		});

		it("includes the full path in the error message", () => {
			const parent: ReportPath = { report: { suiteName: "MySuite" } };
			const errors = captureConsoleErrors(() => recordTestResult(parent, errorEntry));
			const combined = errors.join(" ");
			assert.match(combined, /MySuite/);
			assert.match(combined, /Example Failing Test/);
		});
	});

	describe("finishLoggingReport", () => {
		let tmpDir: string;
		let outputFile: string;

		beforeEach(() => {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reporter-test-"));
			outputFile = path.join(tmpDir, "results.json");
		});

		afterEach(() => {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});

		function withConsoleCapture(fn: () => void): string[] {
			const originalLog = console.log;
			const logs: string[] = [];
			console.log = (...args: unknown[]) => logs.push(args.join(" "));
			try {
				fn();
			} finally {
				console.log = originalLog;
			}
			return logs;
		}

		it("writes results JSON to the output file", () => {
			const reports: ReportArray = [
				{ suiteName: "MySuite", contents: [successEntry, errorEntry] },
			];
			withConsoleCapture(() => finishLoggingReport({ content: reports }, true, outputFile));
			assert(fs.existsSync(outputFile));
			const parsed = JSON.parse(fs.readFileSync(outputFile, "utf8")) as unknown;
			assert.deepEqual(parsed, reports);
		});

		it("does not throw when no outputFilePath is provided", () => {
			const reports: ReportArray = [{ suiteName: "Suite", contents: [successEntry] }];
			withConsoleCapture(() => finishLoggingReport({ content: reports }, true, undefined));
			// No assertions needed — just verifying no exception is thrown.
		});

		it("does not create a file when no outputFilePath is provided", () => {
			const reports: ReportArray = [{ suiteName: "Suite", contents: [successEntry] }];
			withConsoleCapture(() => finishLoggingReport({ content: reports }, true, undefined));
			const files = fs.readdirSync(tmpDir);
			assert.deepEqual(files, []);
		});

		it("logs suite tables when incremental=false", () => {
			const logs: string[] = withConsoleCapture(() =>
				finishLoggingReport(
					{ content: [{ suiteName: "Suite A", contents: [successEntry] }] },
					false,
					undefined,
				),
			);
			const combined = logs.join("\n");
			assert.match(combined, /^Suite A/);
		});

		it("skips suite tables when incremental=true", () => {
			const logs: string[] = withConsoleCapture(() =>
				finishLoggingReport(
					{ content: [{ suiteName: "Suite A", contents: [successEntry] }] },
					true,
					undefined,
				),
			);
			const combined = logs.join("\n");
			assert.doesNotMatch(combined, /^Suite A/);
		});

		it("writes nested suites correctly to JSON", () => {
			const reports: ReportArray = [
				{
					suiteName: "Outer",
					contents: [
						{
							suiteName: "Inner",
							contents: [successEntry],
						},
					],
				},
			];
			withConsoleCapture(() => finishLoggingReport({ content: reports }, true, outputFile));
			const parsed = parseReport(fs.readFileSync(outputFile, "utf8"));
			assert.deepEqual(parsed, reports);
		});
	});
});
