/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { strict as assert } from "node:assert";

import { BenchmarkReporter, type ReportArray } from "../Reporter.js";
import { ValueType, type CollectedData, type BenchmarkResult } from "../ResultTypes.js";

// A minimal passing CollectedData result.
const successResult: CollectedData = [
	{
		name: "duration",
		value: 1.5,
		units: "ns/op",
		type: ValueType.SmallerIsBetter,
		significance: "Primary",
	},
];

// A minimal failing BenchmarkResult.
const errorResult: BenchmarkResult = { error: "something went wrong" };

/** Silences console.log for the duration of fn. */
async function withSilentConsole(fn: () => Promise<void>): Promise<void> {
	const originalConsole = console.log;
	console.log = () => {};
	try {
		await fn();
	} finally {
		console.log = originalConsole;
	}
}

describe("BenchmarkReporter", () => {
	describe("error cases", () => {
		it("throws when recordSuiteResults is called without a matching beginSuite", () => {
			const reporter = new BenchmarkReporter();
			assert.throws(
				() => reporter.recordSuiteResults(),
				/recordSuiteResults called without a matching beginSuite/,
			);
		});

		it("throws when recordResultsSummary is called with an open suite", () => {
			const reporter = new BenchmarkReporter();
			reporter.beginSuite("open");
			assert.throws(
				() => reporter.recordResultsSummary(),
				/all suites should be closed except root when calling recordResultsSummary/,
			);
		});
	});

	describe("JSON output", () => {
		let tmpDir: string;
		let outputFile: string;

		beforeEach(() => {
			tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reporter-test-"));
			outputFile = path.join(tmpDir, "results.json");
		});

		afterEach(() => {
			fs.rmSync(tmpDir, { recursive: true, force: true });
		});

		it("writes both passing and error results", async () => {
			await withSilentConsole(async () => {
				const reporter = new BenchmarkReporter(outputFile);
				reporter.beginSuite("MySuite");
				reporter.recordTestResult("passing test", successResult);
				reporter.recordTestResult("failing test", errorResult);
				reporter.recordSuiteResults();
				reporter.recordResultsSummary();
			});

			const output = JSON.parse(fs.readFileSync(outputFile, "utf8")) as ReportArray;
			assert.deepEqual(output, [
				{
					suiteName: "MySuite",
					contents: [
						{ benchmarkName: "passing test", data: successResult },
						{ benchmarkName: "failing test", data: errorResult },
					],
				},
			]);
		});

		it("includes suites that contain only errors", async () => {
			await withSilentConsole(async () => {
				const reporter = new BenchmarkReporter(outputFile);
				reporter.beginSuite("AllErrors");
				reporter.recordTestResult("bad test", errorResult);
				reporter.recordSuiteResults();
				reporter.recordResultsSummary();
			});

			const output = JSON.parse(fs.readFileSync(outputFile, "utf8")) as ReportArray;
			assert.deepEqual(output, [
				{
					suiteName: "AllErrors",
					contents: [{ benchmarkName: "bad test", data: errorResult }],
				},
			]);
		});

		it("writes nested suites correctly", async () => {
			await withSilentConsole(async () => {
				const reporter = new BenchmarkReporter(outputFile);
				reporter.beginSuite("Outer");
				reporter.beginSuite("Inner");
				reporter.recordTestResult("nested test", successResult);
				reporter.recordSuiteResults(); // close Inner
				reporter.recordSuiteResults(); // close Outer
				reporter.recordResultsSummary();
			});

			const output = JSON.parse(fs.readFileSync(outputFile, "utf8")) as ReportArray;
			assert.deepEqual(output, [
				{
					suiteName: "Outer",
					contents: [
						{
							suiteName: "Inner",
							contents: [{ benchmarkName: "nested test", data: successResult }],
						},
					],
				},
			]);
		});

		it("includes multiple suites at the top level", async () => {
			await withSilentConsole(async () => {
				const reporter = new BenchmarkReporter(outputFile);
				reporter.beginSuite("Suite A");
				reporter.recordTestResult("a1", successResult);
				reporter.recordSuiteResults();
				reporter.beginSuite("Suite B");
				reporter.recordTestResult("b1", successResult);
				reporter.recordSuiteResults();
				reporter.recordResultsSummary();
			});

			const output = JSON.parse(fs.readFileSync(outputFile, "utf8")) as ReportArray;
			assert.deepEqual(output, [
				{
					suiteName: "Suite A",
					contents: [{ benchmarkName: "a1", data: successResult }],
				},
				{
					suiteName: "Suite B",
					contents: [{ benchmarkName: "b1", data: successResult }],
				},
			]);
		});

		it("does not error when no outputFilePath is provided", async () => {
			await withSilentConsole(async () => {
				const reporter = new BenchmarkReporter();
				reporter.beginSuite("NoFile");
				reporter.recordTestResult("t", successResult);
				reporter.recordSuiteResults();
				reporter.recordResultsSummary();
			});
			// No assertions needed; we just verify no exception was thrown.
		});
	});
});
