/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import * as path from "path";
import * as fs from "fs";
import Benchmark from "benchmark";
import Table from "easy-table";
import { Runner, Suite, Test } from "mocha";
import { benchmarkTypes, isChildProcess, performanceTestSuiteTag } from "./Configuration";
// import { BenchmarkReporter, failedData } from "./Reporter";
import { MemoryTestStats } from "./MemoryTestRunner";
import { bold, green, italicize, pad, prettyNumber, red } from "./ReporterUtilities";

const tags = [performanceTestSuiteTag];

for (const tag of benchmarkTypes) {
    tags.push(`@${tag}`);
}

/**
 * Strip tags from name.
 */
const getSuiteName = (suite: Suite): string => getName(suite.fullTitle());

/**
 * Strip tags from name.
 */
function getName(name: string): string {
    let s = name;
    for (const tag of tags) {
        s = s.replace(tag, "");
    }
    return s.trim();
}

/**
 * Custom mocha reporter for memory tests. It can be used by passing the JavaScript version of this file to
 * mocha's --reporter option.
 *
 * This reporter takes output from mocha events and prints a user-friendly version of the results, in addition
 * to writing them to a file. The path of the output file can be controlled with --reporterOption reportDir=<path>.
 * This logic is coupled to MemoryTestRunner, and depends on how it emits the actual benchmark data.
 *
 * See https://mochajs.org/api/tutorial-custom-reporter.html for more information about custom mocha reporters.
 */
class MemoryTestMochaReporter {
    private readonly inProgressSuites: Map<string, [string, MemoryTestStats][]> = new Map();
    private readonly outputDirectory: string;

    public constructor(runner: Runner, options?: { reporterOption?: { reportDir?: string; }; }) {
        // If changing this or the result file logic in general,
        // be sure to update the glob used to look for output files in the perf pipeline.
        const reportDir = options?.reporterOption?.reportDir ?? "";
        this.outputDirectory = reportDir !== "" ? path.resolve(reportDir) : path.join(__dirname, ".output");
        if (!fs.existsSync(this.outputDirectory)) {
            fs.mkdirSync(this.outputDirectory, { recursive: true });
        }

        // const benchmarkReporter = new BenchmarkReporter(options?.reportDir);
        const data: Map<Test, MemoryTestStats> = new Map();

        runner
            .on(Runner.constants.EVENT_TEST_BEGIN, (test: Test) => {
                // Forward results from `benchmark end` to BenchmarkReporter.
                test.on("benchmark end", (memoryTestStats: MemoryTestStats) => {
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
                    // benchmarkReporter.recordTestResult(suite, getName(test.title), failedData);
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
                    // benchmarkReporter.recordTestResult(suite, getName(test.title), memoryTestStats);
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

                    // console.log(JSON.stringify(suiteData));

                    const table = new Table();
                    suiteData?.forEach(([testName, testData]) => {
                        if (testData.aborted) {
                            table.cell("status", `${pad(4)}${red("×")}`);
                        } else {
                            table.cell("status", `${pad(4)}${green("✔")}`);
                        }
                        table.cell("name", italicize(testName));
                        if (!testData.aborted) {
                            const heapUsedArray = testData.memoryUsageStats
                                .map((memUsageStats) => memUsageStats.after.heapUsed - memUsageStats.before.heapUsed);
                            const heapUsedStats = getArrayStatistics(heapUsedArray);
                            table.cell("Heap Used Avg", prettyNumber(heapUsedStats.mean, 2), Table.padLeft);
                            table.cell("Heap Used StdDev", prettyNumber(heapUsedStats.deviation, 2), Table.padLeft);
                            table.cell("Root Mean Error", `±${prettyNumber(heapUsedStats.rme, 2)}%`, Table.padLeft);
                            table.cell("Samples", testData.runs.toString(), Table.padLeft);
                        }
                        table.newRow();
                    });
                    console.log(`${table.toString()}`);
                    this.writeCompletedBenchmarks(suiteName);
                    this.inProgressSuites.delete(suiteName);

                    // benchmarkReporter.recordSuiteResults(getSuiteName(suite));
                }
            })
            .once(Runner.constants.EVENT_RUN_END, () => {
                if (!isChildProcess) {
                    // benchmarkReporter.recordResultsSummary();
                }
            });
    }

    private writeCompletedBenchmarks(suiteName: string): string {
        const outputFriendlyBenchmarks: unknown[] = [];
        // Filter successful benchmarks and ready them for output to file
        const suiteData = this.inProgressSuites.get(suiteName);

//        const successful = Benchmark.filter(Array.from(benchmarks.values()), "successful");
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
        console.info(`Wrote file to ${fullPath}`);
        return fullPath;
    }
}

/**
 * T-Distribution two-tailed critical values for 95% confidence.
 * For more info see http://www.itl.nist.gov/div898/handbook/eda/section3/eda3672.htm.
 */
/* eslint-disable quote-props,key-spacing,no-multi-spaces */
const tTable = {
    "1":  12.706, "2":  4.303, "3":  3.182, "4":  2.776, "5":  2.571, "6":  2.447,
    "7":  2.365,  "8":  2.306, "9":  2.262, "10": 2.228, "11": 2.201, "12": 2.179,
    "13": 2.16,   "14": 2.145, "15": 2.131, "16": 2.12,  "17": 2.11,  "18": 2.101,
    "19": 2.093,  "20": 2.086, "21": 2.08,  "22": 2.074, "23": 2.069, "24": 2.064,
    "25": 2.06,   "26": 2.056, "27": 2.052, "28": 2.048, "29": 2.045, "30": 2.042,
    "infinity": 1.96,
};
/* eslint-enable */

function getArrayStatistics(array: number[]): Benchmark.Stats {
    const n = array.length;
    let max = -Infinity;
    let min = Infinity;
    let mean = 0;
    array.forEach((x) => {
        mean += x;
        if (x > max) { max = x; }
        if (x < min) { min = x; }
    });
    mean /= n;

    const variance = array.map((x) => (x - mean) ** 2).reduce((a, b) => a + b) / n;
    const deviation = Math.sqrt(variance);
    const sem = deviation / Math.sqrt(n);
    const df = n - 1;
    const critical = tTable[Math.round(df) || "1"] ?? tTable.infinity;
    const moe = sem * critical;
    const rme = (moe / mean) * 100 || 0;

    return { mean, variance, deviation, moe, sem, sample: array, rme };
}

module.exports = MemoryTestMochaReporter;
