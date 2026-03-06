/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import chalk from "chalk";
import { Runner, type Suite, type Test, type Hook } from "mocha";

import { isChildProcess } from "../Configuration.js";
import { BenchmarkReporter } from "../Reporter.js";
import type { BenchmarkResult, BenchmarkError } from "../ResultTypes.js";
import { getName } from "./mochaReporterUtilities.js";

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
	private readonly data: Map<Test, Readonly<BenchmarkResult>> = new Map();
	public constructor(runner: Runner, options?: { reporterOptions?: ReporterOptions }) {
		const benchmarkReporter = new BenchmarkReporter(options?.reporterOptions?.reportFile);
		runner
			.on(Runner.constants.EVENT_SUITE_BEGIN, (suite: Suite) => {
				if (!isChildProcess && !suite.root) {
					benchmarkReporter.beginSuite(suite.title);
				}
			})
			.on(Runner.constants.EVENT_TEST_BEGIN, (test: Test) => {
				// Forward results from `benchmark end` to BenchmarkReporter.
				test.on("benchmark end", (benchmark: Readonly<BenchmarkResult>) => {
					// There are (at least) two ways a benchmark can fail:
					// The actual benchmark part of the test aborts for some reason OR
					// the mocha test fails (ex: validation after the benchmark reports an issue).
					// So instead of reporting the data now, wait until the mocha test ends so we can confirm the
					// test passed.
					this.data.set(test, benchmark);
				});
			})
			.on(Runner.constants.EVENT_TEST_END, (test: Test) => {
				if (test.state === "pending") {
					return; // Test was skipped.
				}

				let benchmark: BenchmarkResult | undefined = this.data.get(test);
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

				benchmarkReporter.recordTestResult(getName(test.title), benchmark);
			})
			.on(Runner.constants.EVENT_SUITE_END, (suite: Suite) => {
				if (!isChildProcess && !suite.root) {
					benchmarkReporter.recordSuiteResults();
				}
			})
			.on(Runner.constants.EVENT_HOOK_END, (hook: Hook) => {
				// Documentation ( https://mochajs.org/api/hook#error ) implies this is an Error.
				// Inspecting with the debugger shows the non-error case uses `null`
				// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
				const error: Error | null = hook.error();
				if (error !== null) {
					console.error(chalk.red(`Hook ${hook.fullTitle()} failed with error: `, error));
				}
			})
			.once(Runner.constants.EVENT_RUN_END, () => {
				if (!isChildProcess) {
					benchmarkReporter.recordResultsSummary();
				}
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
