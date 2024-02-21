/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file is a reporter used with node, so depending on node is fine.
/* eslint-disable import/no-nodejs-modules */
/* eslint-disable unicorn/prefer-module */

import * as path from "node:path";
import * as fs from "fs";
import Table from "easy-table";
import { Runner, Suite, Test } from "mocha";
import chalk from "chalk";
import { isChildProcess } from "./Configuration";
import { pad, prettyNumber, getName } from "./ReporterUtilities";
// TODO: this file should be moved in with the mocha specific stuff, but is left where it is for now to avoid breaking users of this reporter.
// Since it's not moved yet, it needs this lint suppression to do this import:
// eslint-disable-next-line import/no-internal-modules
import { MemoryBenchmarkStats } from "./mocha/memoryTestRunner";
// eslint-disable-next-line import/no-internal-modules
import { getSuiteName } from "./mocha/mochaReporterUtilities";

/**
 * Custom mocha reporter for memory tests. It can be used by passing the JavaScript version of this file to
 * mocha's --reporter option.
 *
 * This reporter takes output from mocha events and prints a user-friendly version of the results, in addition
 * to writing them to a file. The path of the output file can be controlled with --reporterOptions reportDir=<path>.
 * This logic is coupled to MemoryTestRunner, and depends on how it emits the actual benchmark data.
 *
 * See https://mochajs.org/api/tutorial-custom-reporter.html for more information about custom mocha reporters.
 */
class MochaMemoryTestReporter {
	private readonly inProgressSuites: Map<string, [string, MemoryBenchmarkStats][]> = new Map();
	private readonly outputDirectory: string;

	public constructor(runner: Runner, options?: { reporterOptions?: { reportDir?: string } }) {
		// If changing this or the result file logic in general,
		// be sure to update the glob used to look for output files in the perf pipeline.
		const reportDir = options?.reporterOptions?.reportDir ?? "";
		this.outputDirectory =
			reportDir !== "" ? path.resolve(reportDir) : path.join(__dirname, ".output");

		fs.mkdirSync(this.outputDirectory, { recursive: true });

		const data: Map<Test, MemoryBenchmarkStats> = new Map();

		runner
			.on(Runner.constants.EVENT_TEST_BEGIN, (test: Test) => {
				// Forward results from `benchmark end` to BenchmarkReporter.
				test.on("benchmark end", (memoryTestStats: MemoryBenchmarkStats) => {
					// There are (at least) two ways a benchmark can fail:
					// The actual benchmark part of the test aborts for some reason OR
					// the mocha test fails (ex: validation after the benchmark reports an issue).
					// So instead of reporting the data now, wait until the mocha test ends so we can confirm the
					// test passed.
					data.set(test, memoryTestStats);
				});
			})
			.on(Runner.constants.EVENT_TEST_FAIL, (test, err) => {
				console.info(chalk.red(`Test ${test.fullTitle()} failed with error: `, err));
			})
			.on(Runner.constants.EVENT_TEST_END, (test: Test) => {
				// Type signature for `Test.state` indicates it will never be 'pending',
				// but that is incorrect: skipped tests have state 'pending' here.
				// See: https://github.com/mochajs/mocha/issues/4079
				if (test.state === ("pending" as string)) {
					return; // Test was skipped.
				}

				const suite = test.parent ? getSuiteName(test.parent) : "root suite";
				const memoryTestStats = data.get(test);
				if (memoryTestStats === undefined) {
					// Mocha test complected with out reporting data. This is an error, so report it as such.
					console.error(
						chalk.red(
							`Test ${test.title} in ${suite} completed with status '${test.state}' without reporting any data.`,
						),
					);
					return;
				}
				if (test.state !== "passed") {
					// The mocha test failed after reporting benchmark data.
					// This may indicate the benchmark did not measure what was intended, so mark as aborted.
					console.info(
						chalk.red(
							`Test ${test.title} in ${suite} completed with status '${test.state}' after reporting data.`,
						),
					);
					memoryTestStats.aborted = true;
				}

				if (isChildProcess) {
					// Write the data to stdout so the parent process can collect it.
					console.info(JSON.stringify(memoryTestStats));
				} else {
					let suiteData = this.inProgressSuites.get(suite);
					if (suiteData === undefined) {
						suiteData = [];
						this.inProgressSuites.set(suite, suiteData);
					}
					suiteData.push([getName(test.title), memoryTestStats]);
				}
			})
			.on(Runner.constants.EVENT_SUITE_END, (suite: Suite) => {
				if (!isChildProcess) {
					const suiteName = getSuiteName(suite);
					const suiteData = this.inProgressSuites.get(suiteName);
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
					this.writeCompletedBenchmarks(suiteName);
					this.inProgressSuites.delete(suiteName);
				}
			})
			.once(Runner.constants.EVENT_RUN_END, () => {});
	}

	private writeCompletedBenchmarks(suiteName: string): string {
		const outputFriendlyBenchmarks: unknown[] = [];
		const suiteData = this.inProgressSuites.get(suiteName);
		if (suiteData !== undefined) {
			for (const [testName, testData] of suiteData) {
				if (testData.aborted) {
					break;
				}
				outputFriendlyBenchmarks.push({
					testName,
					testData,
				});
			}
		}

		// Use the suite name as a filename, but first replace non-alphanumerics with underscores
		const suiteNameEscaped: string = suiteName.replace(/[^\da-z]/gi, "_");
		const outputContentString: string = JSON.stringify(
			{ suiteName, tests: outputFriendlyBenchmarks },
			undefined,
			4,
		);

		// If changing this or the result file logic in general,
		// be sure to update the glob used to look for output files in the perf pipeline.
		const outputFilename = `${suiteNameEscaped}_memoryresult.json`;
		const fullPath: string = path.join(this.outputDirectory, outputFilename);
		fs.writeFileSync(fullPath, outputContentString);
		return fullPath;
	}
}

module.exports = MochaMemoryTestReporter;
