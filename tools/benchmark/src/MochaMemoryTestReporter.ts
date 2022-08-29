/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import * as fs from "fs";
import Table from "easy-table";
import { Runner, Suite, Test } from "mocha";
import { isChildProcess } from "./Configuration";
import {
    bold,
    green,
    italicize,
    pad,
    prettyNumber,
    red,
    getArrayStatistics,
    getName,
    getSuiteName,
} from "./ReporterUtilities";
import { MemoryBenchmarkStats } from "./MemoryTestRunner";

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

    public constructor(runner: Runner, options?: { reporterOptions?: { reportDir?: string; }; }) {
        // If changing this or the result file logic in general,
        // be sure to update the glob used to look for output files in the perf pipeline.
        const reportDir = options?.reporterOptions?.reportDir ?? "";
        this.outputDirectory = reportDir !== "" ? path.resolve(reportDir) : path.join(__dirname, ".output");
        if (!fs.existsSync(this.outputDirectory)) {
            fs.mkdirSync(this.outputDirectory, { recursive: true });
        }

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
                console.info(red(`Test ${test.fullTitle()} failed with error: '${err.message}'`));
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
                        red(
                            `Test ${test.title} in ${suite} completed with status '${
                                test.state}' without reporting any data.`,
                        ),
                    );
                    return;
                }
                if (test.state !== "passed") {
                    // The mocha test failed after reporting benchmark data.
                    // This may indicate the benchmark did not measure what was intended, so mark as aborted.
                    console.info(
                        red(
                            `Test ${test.title} in ${suite} completed with status '${
                                test.state}' after reporting data.`,
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
                    console.log(`\n${bold(suiteName)}`);

                    const table = new Table();
                    const failedTests = new Array<[string, MemoryBenchmarkStats]>();
                    suiteData?.forEach(([testName, testData]) => {
                        if (testData.aborted) {
                            table.cell("status", `${pad(4)}${red("×")}`);
                            failedTests.push([testName, testData]);
                        } else {
                            table.cell("status", `${pad(4)}${green("✔")}`);
                        }
                        table.cell("name", italicize(testName));
                        if (!testData.aborted) {
                            const heapUsedArray: number[] = [];
                            for (let i = 0; i < testData.samples.before.memoryUsage.length; i++) {
                                heapUsedArray.push(testData.samples.after.memoryUsage[i].heapUsed
                                                   - testData.samples.before.memoryUsage[i].heapUsed);
                            }
                            const heapUsedStats = getArrayStatistics(heapUsedArray);
                            table.cell("Heap Used Avg", prettyNumber(heapUsedStats.mean, 2), Table.padLeft);
                            table.cell("Heap Used StdDev", prettyNumber(heapUsedStats.deviation, 2), Table.padLeft);
                            table.cell("Margin of Error", `±${prettyNumber(heapUsedStats.moe, 2)}`, Table.padLeft);
                            table.cell("Relative Margin of Error",
                                `±${prettyNumber(heapUsedStats.rme, 2)}%`, Table.padLeft);
                            table.cell("Samples", testData.runs.toString(), Table.padLeft);
                        }
                        table.newRow();
                    });
                    console.log(`${table.toString()}`);
                    console.log("------------------------------------------------------", `\n${red("ERRORS:")}`);
                    failedTests.forEach(([testName, testData]) => {
                        console.log(`\n${red(testName)}`, "\n", testData.error);
                    });
                    this.writeCompletedBenchmarks(suiteName);
                    this.inProgressSuites.delete(suiteName);
                }
            })
            .once(Runner.constants.EVENT_RUN_END, () => { });
    }

    private writeCompletedBenchmarks(suiteName: string): string {
        const outputFriendlyBenchmarks: unknown[] = [];
        const suiteData = this.inProgressSuites.get(suiteName);
        suiteData?.forEach(([testName, testData]) => {
            if (testData.aborted) {
                return;
            }
            outputFriendlyBenchmarks.push({
                testName,
                testData,
            });
        });

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
