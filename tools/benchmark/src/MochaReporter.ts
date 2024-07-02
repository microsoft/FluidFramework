/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "node:path";

import chalk from "chalk";
import Table from "easy-table";
import { Runner, Suite, Test } from "mocha";

import { isChildProcess, ReporterOptions } from "./Configuration";
import { BenchmarkReporter } from "./Reporter";
import { getName, isMemoryBenchmarkStats, pad, prettyNumber, writeCompletedBenchmarks } from "./ReporterUtilities";
// TODO: this file should be moved in with the mocha specific stuff, but is left where it is for now to avoid breaking users of this reporter.
// Since it's not moved yet, it needs this lint suppression to do this import:
// eslint-disable-next-line import/no-internal-modules
import { MemoryBenchmarkStats } from "./mocha/memoryTestRunner";
// eslint-disable-next-line import/no-internal-modules
import { getSuiteName } from "./mocha/mochaReporterUtilities";
import { BenchmarkData, BenchmarkResult } from "./runBenchmark";

/**
 * Custom mocha reporter (can be used by passing the JavaScript version of this file to mocha with --reporter).
 * The path of the output file can be controlled with --reporterOptions reportDir=<path>.
 * Mocha expects the `exports` of the reporter module to be a constructor accepting a `Mocha.Runner`, so we
 * match that here.
 *
 * This reporter takes output from mocha events and sends them to BenchmarkReporter.
 * This logic is coupled to BenchmarkRunner, and depends on how it emits the actual benchmark data.
 *
 * See https://mochajs.org/api/tutorial-custom-reporter.html for more information about custom mocha reporters.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class, unicorn/prefer-module
module.exports = class {
	public constructor(runner: Runner, data: Map<Test, BenchmarkResult>, options?: { reporterOptions?: ReporterOptions }) {
		const benchmarkReporter = new BenchmarkReporter(options?.reporterOptions?.reportDir);
		runner
			.on(Runner.constants.EVENT_TEST_BEGIN, (test: Test) => {
				// Forward results from `benchmark end` to BenchmarkReporter.
				test.on("benchmark end", (benchmark: BenchmarkData) => {
					// There are (at least) two ways a benchmark can fail:
					// The actual benchmark part of the test aborts for some reason OR
					// the mocha test fails (ex: validation after the benchmark reports an issue).
					// So instead of reporting the data now, wait until the mocha test ends so we can confirm the
					// test passed.
					data.set(test, benchmark);
				});
			})
			.on(Runner.constants.EVENT_TEST_FAIL, (test, err) => {
				console.error(chalk.red(`Test ${test.fullTitle()} failed with error: `, err));
			})
			.on(Runner.constants.EVENT_TEST_END, (test: Test) => {
				// Type signature for `Test.state` indicates it will never be 'pending',
				// but that is incorrect: skipped tests have state 'pending' here.
				// See: https://github.com/mochajs/mocha/issues/4079
				if (test.state === ("pending" as string)) {
					return; // Test was skipped.
				}

				const suite = test.parent ? getSuiteName(test.parent) : "root suite";
				let benchmarkResult = data.get(test);
				if (benchmarkResult === undefined) {
					// Mocha test complected with out reporting data.
					// This is an error, so report it as such.
					const error = `Test ${test.title} in ${suite} completed with status '${test.state}' without reporting any data.`;
					console.error(chalk.red(error));
					benchmarkReporter.recordTestResult(suite, getName(test.title), { error });
					return;
				}
				if (test.state !== "passed") {
					// The mocha test failed after reporting benchmark data.
					// This may indicate the benchmark did not measure what was intended, so mark as aborted.
					const error = `Test ${test.title} in ${suite} completed with status '${test.state}' after reporting data.`;
					console.error(chalk.red(error));
					benchmarkResult = { error };

					if (isMemoryBenchmarkStats(benchmarkResult)) {
						(benchmarkResult as unknown as MemoryBenchmarkStats).aborted = true;
					}
				}

				if (isChildProcess) {
					// Write the data to stdout so the parent process can collect it.
					console.info(JSON.stringify(benchmarkResult));
				} else {
					if (isMemoryBenchmarkStats(benchmarkResult)) {
						let suiteData = benchmarkReporter.inProgressSuites.get(suite) as [string, MemoryBenchmarkStats][];
						if (suiteData === undefined) {
							suiteData = [];
							benchmarkReporter.inProgressSuites.set(suite, suiteData);
						}
						suiteData.push([getName(test.title), benchmarkResult]);
					} else {
						benchmarkReporter.recordTestResult(suite, getName(test.title), benchmarkResult);
					}
				}
			})
			.on(Runner.constants.EVENT_SUITE_END, (suite: Suite) => {
				if (!isChildProcess) {
					const suiteName = getSuiteName(suite);
					const suiteData = benchmarkReporter.inProgressSuites.get(suiteName);
					// Memory test output only
					if (Array.isArray(suiteData)) {
						const reportDir = options?.reporterOptions?.reportDir ?? "";
						const outputDirectory = reportDir === "" ? path.join(__dirname, ".output") : path.resolve(reportDir);
						if (suiteData === undefined) {
							return;
						}
						console.log(`\n${chalk.bold(suiteName)}`);

						const table = new Table();
						const failedTests = new Array<[string, MemoryBenchmarkStats]>();
						if (suiteData !== undefined) {
							for (const [testName, testData] of suiteData) {
								if (testData.aborted) {
									table.cell("status", `${pad(4)}${chalk.red("×")}`);
									failedTests.push([testName, testData]);
								} else {
									table.cell("status", `${pad(4)}${chalk.green("✔")}`);
								}
								table.cell("name", chalk.italic(testName));
								if (!testData.aborted) {
									table.cell(
										"Heap Used Avg",
										prettyNumber(testData.stats.arithmeticMean, 2),
										Table.padLeft,
									);
									table.cell(
										"Heap Used StdDev",
										prettyNumber(testData.stats.standardDeviation, 2),
										Table.padLeft,
									);
									table.cell(
										"Margin of Error",
										`±${prettyNumber(testData.stats.marginOfError, 2)}`,
										Table.padLeft,
									);
									table.cell(
										"Relative Margin of Error",
										`±${prettyNumber(testData.stats.marginOfErrorPercent, 2)}%`,
										Table.padLeft,
									);

									table.cell("Iterations", testData.runs.toString(), Table.padLeft);
									table.cell(
										"Samples used",
										testData.stats.samples.length.toString(),
										Table.padLeft,
									);
									table.cell(
										"Avg ms/iteration",
										`${prettyNumber(testData.totalRunTimeMs / testData.runs, 2)}`,
										Table.padLeft,
									);
								}
								table.newRow();
							}
						}

						console.log(`${table.toString()}`);
						if (failedTests.length > 0) {
							console.log(
								"------------------------------------------------------",
								`\n${chalk.red("ERRORS:")}`,
							);
							for (const [testName, testData] of failedTests) {
								console.log(`\n${chalk.red(testName)}`, "\n", testData.error);
							}
						}
						writeCompletedBenchmarks(suiteName, outputDirectory, suiteData);
						benchmarkReporter.inProgressSuites.delete(suiteName);
					} else {
							benchmarkReporter.recordSuiteResults(suiteName);
					}
				}
			})
			.once(Runner.constants.EVENT_RUN_END, () => {
				if (!isChildProcess) {
					benchmarkReporter.recordResultsSummary();
				}
			});
	}
};
