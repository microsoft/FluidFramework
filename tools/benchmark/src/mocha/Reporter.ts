/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import chalk from "chalk";
import { Runner, type Suite, type Test, type Hook } from "mocha";

import {
	formatResultArrayTable,
	finishLoggingReport,
	recordTestResult,
	type ReportSuiteWithPath,
	type SuiteData,
} from "../reporterUtilities.js";
import {
	type BenchmarkResult,
	type BenchmarkError,
	parseBenchmarkResult,
	type ReportArray,
	type ReportEntry,
} from "../reportTypes.js";
import { assert } from "../assert.js";
import { isChildProcess } from "../Configuration.js";

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
 * This reporter listens to mocha events and builds a report from benchmark data emitted by each test via `emitResultsMocha`.
 *
 * See https://mochajs.org/api/tutorial-custom-reporter.html for more information about custom mocha reporters.
 */
// eslint-disable-next-line unicorn/prefer-module
module.exports = class {
	private readonly suiteData: Map<MochaId, ReportSuiteWithPath> = new Map();
	private readonly testData: Map<string, ReportEntry> = new Map();
	private readonly reportFile?: string;
	private readonly reports: ReportArray = [];
	public constructor(runner: Runner, options?: { reporterOptions?: ReporterOptions }) {
		this.reportFile = options?.reporterOptions?.reportFile;
		runner
			.on(Runner.constants.EVENT_SUITE_BEGIN, (suite: Suite) => {
				const parent = suite.parent;
				if (parent === undefined || parent === null) {
					// Ignore root suites so that they all are implicitly merged together.
				} else {
					const report = { suiteName: suite.title, contents: [] };
					const parentData = this.suiteData.get(suiteId(parent));
					if (parentData === undefined) {
						this.reports.push(report);
					} else {
						parentData.report.contents.push(report);
					}
					assert(!this.suiteData.has(suiteId(suite)), `duplicate suite id`);
					this.suiteData.set(suiteId(suite), { report, parent: parentData });
				}
			})
			.on(Runner.constants.EVENT_TEST_BEGIN, (test: Test) => {
				// In non-parallel mode, subscribe to the `benchmark end` event on the test object.
				// In parallel mode, `on` does not exist, so the data is captured another way, see the `EVENT_TEST_END` handler below.
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
						benchmark = parseBenchmarkResult(body);
					} catch {
						// If the body isn't json, then the event was not put into the body, and so treat it like no data was reported.
					}
				}

				const suiteData = this.getSuiteData(test.parent);

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

				const report: ReportEntry = { benchmarkName: test.title, data: benchmark };
				suiteData.content.push(report);
				recordTestResult(suiteData.parent, report);
			})
			.on(Runner.constants.EVENT_SUITE_END, (suite: Suite) => {
				// Parallel mode (and possibly other cases) result in multiple roots,
				// so don't print the root until the end of the run.
				if (!suite.root) {
					const suiteData = this.getSuiteData(suite);
					logSuite(suiteData);
				}
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
				if (isChildProcess) {
					// Child process tests report their output via recordTestResult and let the parent process do the pretty printing.
					return;
				}

				// Print the root suite
				const suiteData = this.getSuiteData(undefined);
				logSuite(suiteData);

				finishLoggingReport(suiteData, true, this.reportFile);
			});
	}

	private getSuiteData(suite: Suite | undefined): SuiteData {
		if (suite === undefined) {
			return { content: this.reports };
		}
		const suiteData = this.suiteData.get(suiteId(suite));
		if (suiteData === undefined) {
			// In parallel mode, tests directly in the root fail to have "root" set to true, and thus would fail this assert.
			// assert(suite.root, `expected root`);
			return { content: this.reports };
		}
		return { content: suiteData.report.contents, parent: suiteData };
	}
};

function logSuite(suite: SuiteData): void {
	// We should not add more content after printing,
	// so freeze the content to catch any bugs where we do that.
	Object.freeze(suite.content);

	if (isChildProcess) {
		// Child process tests report their output via recordTestResult and let the parent process do the pretty printing.
		return;
	}

	const text = formatResultArrayTable(suite);
	if (text !== undefined) {
		console.log(text);
	}
}

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

type MochaId = Suite | string;

function suiteId(suite: Suite): MochaId {
	// In parallel mode, mocha objects like suites and tests have unstable object identity, and instead rely on an id property.
	if ("__mocha_id__" in suite) {
		return suite.__mocha_id__ as string;
	}
	return suite;
}
