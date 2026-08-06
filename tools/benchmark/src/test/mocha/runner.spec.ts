/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { buildChildArgs, supportParentProcess } from "../../mocha/runner.js";
import type { CollectedData } from "../../reportTypes.js";
import { isResultError, ValueType } from "../../reportTypes.js";
import { isChildProcess } from "../../Configuration.js";
import { recordTestResult } from "../../reporterUtilities.js";

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
	describe("buildChildArgs", () => {
		it("adds --childProcess flag", () => {
			const result = buildChildArgs("my test", [], ["mocha.js"]);
			assert(result.includes("--childProcess"));
		});

		it("adds --grep with anchored exact-match regex", () => {
			const result = buildChildArgs("my test", [], ["mocha.js"]);
			const grepIndex = result.indexOf("--grep");
			assert(grepIndex >= 0, "--grep flag should be present");
			assert.equal(result[grepIndex + 1], "^my test$");
		});

		it("escapes regex special characters in the test title", () => {
			const result = buildChildArgs("test (with) special.*chars?", [], ["mocha.js"]);
			const grepIndex = result.indexOf("--grep");
			assert.equal(result[grepIndex + 1], "^test \\(with\\) special\\.\\*chars\\?$");
		});

		it("removes existing --grep filter from args", () => {
			const result = buildChildArgs("my test", [], ["mocha.js", "--grep", "old filter"]);
			const grepIndices = result.reduce<number[]>(
				(acc, arg, i) => (arg === "--grep" ? [...acc, i] : acc),
				[],
			);
			assert.equal(grepIndices.length, 1, "should have exactly one --grep");
			assert.equal(result[grepIndices[0] + 1], "^my test$");
		});

		it("removes existing --fgrep filter from args", () => {
			const result = buildChildArgs("my test", [], ["mocha.js", "--fgrep", "old filter"]);
			assert(!result.includes("--fgrep"), "--fgrep should be removed");
			const grepIndex = result.indexOf("--grep");
			assert.equal(result[grepIndex + 1], "^my test$");
		});

		it("removes --inspect and --debug flags", () => {
			const result = buildChildArgs(
				"my test",
				["--inspect", "--inspect-brk=9229"],
				["mocha.js"],
			);
			assert(!result.some((a) => a.startsWith("--inspect")));
			assert(!result.some((a) => a.startsWith("--debug")));
		});

		it("preserves execArgv before argv", () => {
			const result = buildChildArgs("my test", ["--max-old-space-size=4096"], ["mocha.js"]);
			const maxOldIndex = result.indexOf("--max-old-space-size=4096");
			const mochaIndex = result.indexOf("mocha.js");
			assert(maxOldIndex >= 0);
			assert(mochaIndex >= 0);
			assert(maxOldIndex < mochaIndex, "execArgv entries should precede argv entries");
		});
	});

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
				// Writes result to console so parent process can capture it.
				recordTestResult(
					{ report: { suiteName: "unused" } },
					{ data: sampleResult, benchmarkName: "unused2" },
				);
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
				recordTestResult(
					{ report: { suiteName: "unused" } },
					{ data: result.result, benchmarkName: "unused2" },
				);
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
				recordTestResult(
					{ report: { suiteName: "unused" } },
					{ data: sampleResult, benchmarkName: "unused2" },
				);
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
				assert.equal(
					result.result.error.split("\n").slice(0, 4).join("\n"),
					`Child process must output a single json object or array. Found 2.
This may be caused by there being multiple mocha tests with the same fullTitle: "runner supportParentProcess errors with duplicate test names"
Such tests are not supported by --parentProcess since there is no way to filter the child process to the correct test.
The full output from the run was:`,
				);
			}
		});

		if (isChildProcess) {
			// Exists to make above test work properly. Not a real test case.
			it("errors with duplicate test names", async function () {
				recordTestResult(
					{ report: { suiteName: "unused" } },
					{ data: sampleResult, benchmarkName: "unused2" },
				);
			});
		}
	});
});
