/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import chalk from "chalk";
import { Runner, type Suite, type Test, type Hook } from "mocha";

import {
	logSuiteTests,
	onCompletion,
	type ReportArray,
	type ReportEntry,
	type ReportSuiteWithPath,
} from "../Reporter.js";
import type { BenchmarkResult, BenchmarkError } from "../ResultTypes.js";

/*
 * Users of this package should be able to author utilities like this for testing tools other than mocha.
 * Therefore, this file should not rely on non-public APIs, except for the mocha specific stuff (like isChildProcess).
 */

/**
 * Custom mocha reporter (can be used by passing the JavaScript version of this file to mocha with --reporter).
 * The path of the output file can be controlled with --reporterOptions reportFile=<path>.
 * Mocha expects the `exports` of the reporter module to be a constructor accepting a `Mocha.Runner`, so we
 * match that here.
 *
 * This reporter takes output from mocha events and sends them to BenchmarkReporter.
 * This logic is coupled to BenchmarkRunner, and depends on how it emits the actual benchmark data.
 *
 * See https://mochajs.org/api/tutorial-custom-reporter.html for more information about custom mocha reporters.
 */
// eslint-disable-next-line unicorn/prefer-module
module.exports = class {
	private readonly suiteData: Map<Suite, ReportSuiteWithPath> = new Map();
	private readonly testData: Map<string, ReportEntry> = new Map();
	private readonly reportFile?: string;
	private readonly reports: ReportArray = [];
	public constructor(runner: Runner, options?: { reporterOptions?: ReporterOptions }) {
		this.reportFile = options?.reporterOptions?.reportFile;
		runner
			.on(Runner.constants.EVENT_SUITE_BEGIN, (suite: Suite) => {
				const parentData =
					suite.parent === undefined ? undefined : this.suiteData.get(suite.parent);
				const report = { suiteName: suite.title, contents: [] };
				if (suite.parent === undefined) {
					this.reports.push(report);
				}
				this.suiteData.set(suite, { report, parent: parentData });
			})
			.on(Runner.constants.EVENT_TEST_BEGIN, (test: Test) => {
				// Forward results from `benchmark end` to BenchmarkReporter.
				// In non-parallel mode, we can subscribe to events on the test object, so do that if possible.
				if ("on" in test) {
					test.on("benchmark end", (benchmark: BenchmarkResult) => {
						// There are (at least) two ways a benchmark can fail:
						// The actual benchmark part of the test aborts for some reason OR
						// the mocha test fails (ex: validation after the benchmark reports an issue).
						// So instead of reporting the data now, wait until the mocha test ends so we can confirm the
						// test passed.
						this.testData.set(test.id, { benchmarkName: test.title, data: benchmark });
					});
				}
			})
			.on(Runner.constants.EVENT_TEST_END, (test: Test) => {
				if (test.state === "pending") {
					return; // Test was skipped.
				}

				let benchmark: BenchmarkResult | undefined = this.testData.get(test.id)?.data;

				if (!("on" in test)) {
					// In parallel mode, we can not subscribe to events on the test,
					// but the event we are in is delayed until after the test ran so we can get the results off of it.
					// To make this work, the emit code crammed the results in the test body, so parse that.

					// The if above narrows test to `never` here, so undo that:
					const test2 = test as Test;
					const body = test2.body;
					try {
						benchmark = JSON.parse(body) as BenchmarkResult;
					} catch {
						// If the body isn't json, then the event was not put into the body, and so treat it like no data was reported.
					}
				}

				const suiteData =
					test.parent === undefined ? undefined : this.suiteData.get(test.parent);
				const reports = suiteData?.report.contents ?? this.reports;

				if (benchmark === undefined) {
					// Mocha test completed without reporting data.
					// This is an error, so report it as such.
					const error = `Test ${test.fullTitle()} completed with status '${
						test.state
					}' without reporting any data.`;
					benchmark = { error };
				} else if (test.state !== "passed") {
					// The mocha test failed after reporting benchmark data.
					// This may indicate the benchmark did not measure what was intended, so mark as aborted.
					const error =
						(benchmark as BenchmarkError).error ??
						`Test ${test.fullTitle()} completed with status '${
							test.state
						}' after reporting data.`;
					benchmark = { error };
				}

				reports.push({ benchmarkName: test.title, data: benchmark });
			})
			.on(Runner.constants.EVENT_SUITE_END, (suite: Suite) => {
				const suiteData = this.suiteData.get(suite);
				if (suiteData === undefined) {
					console.error(chalk.red(`No data found for suite ${suite.fullTitle()}.`));
					return;
				}
				Object.freeze(suiteData.report.contents);
				logSuiteTests(suiteData);
			})
			.on(Runner.constants.EVENT_HOOK_END, (hook: Hook) => {
				// In parallel mode, "error" does not exist, so skip this check.
				if ("error" in hook) {
					// Documentation ( https://mochajs.org/api/hook#error ) implies this is an Error.
					// Inspecting with the debugger shows the non-error case uses `null`
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					const error: Error | null = hook.error();
					if (error !== null) {
						console.error(
							chalk.red(`Hook ${hook.fullTitle()} failed with error: `, error),
						);
					}
				}
			})
			.once(Runner.constants.EVENT_RUN_END, () => {
				onCompletion(this.reports, true, this.reportFile);
			});
	}
};

/**
 * Options for the mocha reporter.
 */
interface ReporterOptions {
	/**
	 * Path to write the combined benchmark results JSON file to.
	 * If not provided, no file is written.
	 */
	readonly reportFile?: string;
}
