/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Runner, Suite, Test } from "mocha";
import { benchmarkTypes, isChildProcess, performanceTestSuiteTag, ReporterOptions } from "./Configuration";
// import { BenchmarkReporter, failedData } from "./Reporter";
import { MemoryTestStats } from "./MemoryTestRunner";
import { red } from "./ReporterUtilities";

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
 * Custom mocha reporter (can be used by passing the JavaScript version of this file to mocha with --reporter).
 * Mocha expects the `exports` of the reporter module to be a constructor accepting a `Mocha.Runner`, so we
 * match that here.
 *
 * This reporter takes output from mocha events and sends them to BenchmarkReporter.
 * This logic is coupled to MemoryTestRunner, and depends on how it emits the actual benchmark data.
 *
 * See https://mochajs.org/api/tutorial-custom-reporter.html for more information about custom mocha reporters.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
module.exports = class {
    public constructor(runner: Runner, options?: ReporterOptions) {
        // const benchmarkReporter = new BenchmarkReporter(options?.reportDir);
        const data: Map<Test, MemoryTestStats> = new Map();
        const inProgressSuites: Map<string, [string, MemoryTestStats][]> = new Map();

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
                console.error(red(`Test ${test.fullTitle()} failed with error: '${err.message}'`));
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
                    console.error(
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
                    let suiteData = inProgressSuites.get(suite);
                    if (suiteData === undefined) {
                        suiteData = [];
                        inProgressSuites.set(suite, suiteData);
                    }
                    suiteData.push([getName(test.title), memoryTestStats]);
                    // benchmarkReporter.recordTestResult(suite, getName(test.title), memoryTestStats);
                }
            })
            .on(Runner.constants.EVENT_SUITE_END, (suite: Suite) => {
                if (!isChildProcess) {
                    const suiteName = getSuiteName(suite);
                    const suiteData = inProgressSuites.get(suiteName);
                    console.log(suiteName);
                    // console.log(JSON.stringify(suiteData));
                    suiteData?.forEach((testData) => {
                        let output = `${testData[0]} - `;
                        const stats = testData[1];

                        if (stats.aborted) {
                            output += red(" FAILED");
                        } else {
                            const heapUsedArray = stats.memoryUsageStats
                                .map((memUsageStats) => memUsageStats.after.heapUsed - memUsageStats.before.heapUsed);
                            const heapUsedStats = getArrayStatistics(heapUsedArray);
                            output += ` AvgHeapUsed: ${heapUsedStats.mean} StdDev: ${heapUsedStats.stddev}`;

                            const peakMallocedMemoryStats =
                                getArrayStatistics(stats.heapStats.map((x) => x.after.peak_malloced_memory));
                            output += ` AvgPeakMallocedMemory: ${peakMallocedMemoryStats.mean} ` +
                                    `StdDev: ${peakMallocedMemoryStats.stddev}`;
                        }
                        console.log(output);
                    });
                    // benchmarkReporter.recordSuiteResults(getSuiteName(suite));
                }
            })
            .once(Runner.constants.EVENT_RUN_END, () => {
                if (!isChildProcess) {
                    // benchmarkReporter.recordResultsSummary();
                }
            });
    }
};

interface ArrayStatistics {
    mean: number;
    stddev: number;
    max: number;
    min: number;
}

function getArrayStatistics(array: number[]): ArrayStatistics {
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
    const stddev = Math.sqrt(array.map((x) => (x - mean) ** 2).reduce((a, b) => a + b) / n);
    return { mean, stddev, max, min };
}
