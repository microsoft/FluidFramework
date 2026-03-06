/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { supportParentProcess } from "../../mocha/runner.js";
import type { CollectedData } from "../../ResultTypes.js";
import { isResultError, ValueType } from "../../ResultTypes.js";
import { isChildProcess } from "../../Configuration.js";
import { BenchmarkReporter } from "../../Reporter.js";

const sampleResult: CollectedData = [
	{
		name: "duration",
		value: 1,
		units: "ms",
		type: ValueType.SmallerIsBetter,
		significance: "Primary",
	},
];

describe("runner", () => {
	describe("supportParentProcess", () => {
		it("calls run() and returns its result when isParentProcess is false", async () => {
			const result = await supportParentProcess("test title", false, async () => {
				return sampleResult;
			});
			assert(isResultError(result.result) === false);
			assert.deepEqual(result.result[0], sampleResult[0]);
			assert.equal(result.result.length, 2);
			assert.equal(result.result[1].name, "Test Duration");
		});

		it("propagates an exception thrown by run() when isParentProcess is false", async () => {
			const error = new Error("run failed");
			const result = await supportParentProcess("test title", false, async () => {
				throw error;
			});
			assert.deepEqual(result, { result: { error: "run failed" }, exception: error });
		});

		it("runs child process when isParentProcess is true", async function () {
			if (isChildProcess) {
				const benchmarkReporter = new BenchmarkReporter();
				// Writes result to console so parent process can capture it.
				benchmarkReporter.recordTestResult("unused", sampleResult);
			} else {
				const result = await supportParentProcess(
					this?.test?.fullTitle() ?? assert.fail(),
					true,
					async () => {
						assert.fail(
							"run should not be called in parent process when useParentProcess is true",
						);
					},
				);

				assert(isResultError(result.result) === false);
				assert.deepEqual(result.result[0], sampleResult[0]);
				assert.equal(result.result.length, 2);
				assert.equal(result.result[1].name, "Test Duration");
			}
		});

		it("collects durations for both parent and child processes", async function () {
			if (isChildProcess) {
				const result = await supportParentProcess(
					this?.test?.fullTitle() ?? assert.fail(),
					false,
					async () => sampleResult,
				);
				const benchmarkReporter = new BenchmarkReporter();
				// Writes result to console so parent process can capture it.
				benchmarkReporter.recordTestResult("unused", result.result);
			} else {
				const result = await supportParentProcess(
					this?.test?.fullTitle() ?? assert.fail(),
					true,
					async () => {
						assert.fail(
							"run should not be called in parent process when useParentProcess is true",
						);
					},
				);

				assert(isResultError(result.result) === false);
				assert.deepEqual(result.result[0], sampleResult[0]);
				assert.equal(result.result.length, 3);
				assert.equal(result.result[1].name, "Child Process Duration");
				assert.equal(result.result[2].name, "Test Duration");
			}
		});

		it("errors with duplicate test names", async function () {
			if (isChildProcess) {
				const benchmarkReporter = new BenchmarkReporter();
				benchmarkReporter.recordTestResult("unused", sampleResult);
			} else {
				const result = await supportParentProcess(
					this?.test?.fullTitle() ?? assert.fail(),
					true,
					async () => {
						assert.fail(
							"run should not be called in parent process when useParentProcess is true",
						);
					},
				);

				assert(isResultError(result.result));
				assert(
					result.result.error
						.startsWith(`Child process must output a single json object or array. Found 2.
This may be caused by there being multiple mocha tests with the same fullTitle: "runner supportParentProcess errors with duplicate test names"
Such tests are not supported by --parentProcess since there is no way to filter the child process to the correct test.
The full output from the run was:`),
				);
			}
		});

		if (isChildProcess) {
			// Exists to make above test work properly. Not a real test case.
			it("errors with duplicate test names", async function () {
				const benchmarkReporter = new BenchmarkReporter();
				benchmarkReporter.recordTestResult("unused", sampleResult);
			});
		}
	});
});
