/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/*
The MIT License (MIT)

Copyright (c) 2015 Robert Klep

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

/* eslint no-console: ["error", { allow: ["log"] }] */
import * as path from "path";
import * as fs from "fs";
import Benchmark from "benchmark";
import Table from "easy-table";
import { bold, geometricMean, italicize, pad, prettyNumber, green, red, yellow } from "./ReporterUtilities";

interface BenchmarkResults {
    table: Table;
    benchmarksMap: Map<string, BenchmarkData>;
}

/**
 * Subset of Benchmark type which is output data.
 * Json compatible.
 * @public
 */
export interface BenchmarkData {
    aborted: boolean;
    readonly error?: Error;
    readonly count: number;
    readonly cycles: number;
    readonly hz: number;

    readonly stats: Benchmark.Stats;
    readonly times: Benchmark.Times;
}

export const failedData: BenchmarkData = {
    aborted: true,
    error: { name: "Aborted", message: "Reason Unknown" },
    count: 0,
    cycles: 0,

    hz: NaN,

    stats: {
        deviation: NaN,
        mean: NaN,
        moe: NaN,
        rme: NaN,
        sample: [],
        sem: NaN,
        variance: NaN,
    },
    times: { cycle: NaN, elapsed: NaN, period: NaN, timeStamp: NaN },
};

/**
 * Collects and formats performance data for a sequence of suites of benchmarks.
 * Data must be provided in the form of one {@link BenchmarkData} for each test in each suite.
 *
 * Benchmark.js is typically used to collect the data.
 *
 * The data will be aggregated and processed.
 * Human friendly tables are logged to the console, and a machine friendly version is logged to json files.
 * @public
 */
export class BenchmarkReporter {
    /**
     * Overall totals (one row per suite)
     */
    private readonly overallSummaryTable: Table = new Table();

    /**
     * Results for each inprogress suite keyed by suite name.
     * Includes results for each tests in the suite that has run.
     *
     * Tracking multiple suites at once is required due to nesting of suites.
     */
    private readonly inProgressSuites: Map<string, BenchmarkResults> = new Map<string, BenchmarkResults>();

    private readonly allBenchmarkPeriodsSeconds: number[] = [];
    private totalSumRuntimeSeconds = 0;
    private totalBenchmarkCount = 0;
    private totalSuccessfulBenchmarkCount = 0;

    private readonly outputDirectory: string;

    /**
     * @param outputDirectory - location to output files to.
     * If not specified, defaults to a '.output' directory next to the javascript version of this file.
     */
    public constructor(outputDirectory?: string) {
        // If changing this or the result file logic in general,
        // be sure to update the glob used to look for output files in the perf pipeline.
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        this.outputDirectory = outputDirectory ? path.resolve(outputDirectory) : path.join(__dirname, ".output");

        if (!fs.existsSync(this.outputDirectory)) {
            fs.mkdirSync(this.outputDirectory, { recursive: true });
        }
    }

    /**
     * Appends a prettified version of the results of a benchmark instance provided to the provided
     * BenchmarkResults object.
     */
    public recordTestResult(suiteName: string, testName: string, benchmarkInstance: BenchmarkData): void {
        let results = this.inProgressSuites.get(suiteName);
        if (results === undefined) {
            results = { table: new Table(), benchmarksMap: new Map<string, BenchmarkData>() };
            this.inProgressSuites.set(suiteName, results);
        }

        const { table, benchmarksMap } = results;

        benchmarksMap.set(testName, benchmarkInstance);
        if (benchmarkInstance.aborted) {
            table.cell("status", `${pad(4)}${red("×")}`);
        } else {
            table.cell("status", `${pad(4)}${green("✔")}`);
        }
        table.cell("name", italicize(testName));
        if (!benchmarkInstance.aborted) {
            const numIterations: number = benchmarkInstance.stats.sample.length * benchmarkInstance.count;
            table.cell("period (ns/op)", prettyNumber(1e9 * benchmarkInstance.times.period, 1), Table.padLeft);
            table.cell("relative margin of error", `±${benchmarkInstance.stats.rme.toFixed(2)}%`, Table.padLeft);
            table.cell("iterations", `${prettyNumber(numIterations, 0)}`, Table.padLeft);
            table.cell("samples", benchmarkInstance.stats.sample.length.toString(), Table.padLeft);
            table.cell("total time (s)", benchmarkInstance.times.elapsed.toFixed(2), Table.padLeft);
        }
        table.newRow();
    }

    /**
     * Logs the benchmark results of a test suite and adds the information to the overall summary.
     * Calling this is optional since recordResultsSummary will call it automatically,
     * however if there are multiple suites with the same name, calling this explicitly can avoid
     * getting them merged together.
     * @param suiteName - the name of the suite. Used to group together related tests.
     */
    public recordSuiteResults(suiteName: string): void {
        const results = this.inProgressSuites.get(suiteName);
        if (results === undefined) {
            // Omit tables for empty suites.
            // Empty Suites are common due to nesting of suites (a suite that contains only suites
            // is considered empty here),
            // so omitting them cleans up the output a lot.
            // Additionally some statistics (ex: geometricMean) can not be computed for empty suites.
            return;
        }

        // Remove suite from map so that other (non-concurrent) suites with the same name won't collide.
        this.inProgressSuites.delete(suiteName);

        const { benchmarksMap, table } = results;

        // Output results from suite
        console.log(`\n${bold(suiteName)}`);
        const filenameFull: string = this.writeCompletedBenchmarks(suiteName, benchmarksMap);
        console.log(`Results file: ${filenameFull}`);
        console.log(`${table.toString()}`);

        // Accumulate totals for suite
        const benchmarkPeriodsSeconds: number[] = [];
        let sumRuntime = 0;
        let countSuccessful = 0;
        let countFailure = 0;
        benchmarksMap.forEach((value: BenchmarkData, key: string) => {
            if (value.aborted) {
                countFailure++;
            } else {
                benchmarkPeriodsSeconds.push(value.times.period);
                sumRuntime += value.times.elapsed;
                countSuccessful++;
            }
        });

        // Add row to overallSummaryTable
        let statusSymbol: string;
        switch (benchmarksMap.size) {
            case countSuccessful:
                statusSymbol = green("✔");
                break;
            case countFailure:
                statusSymbol = red("×");
                break;
            default:
                statusSymbol = yellow("!");
        }
        this.overallSummaryTable.cell("status", pad(4) + statusSymbol);
        this.overallSummaryTable.cell("suite name", italicize(suiteName));
        const geometricMeanString: string = prettyNumber(geometricMean(benchmarkPeriodsSeconds) * 1e9, 1);
        this.overallSummaryTable.cell("geometric mean (ns)", geometricMeanString, Table.padLeft);
        this.overallSummaryTable.cell(
            "# of passed tests",
            `${countSuccessful} out of ${benchmarksMap.size}`,
            Table.padLeft,
        );
        this.overallSummaryTable.cell("total time (s)", `${prettyNumber(sumRuntime, 1)}`, Table.padLeft);
        this.overallSummaryTable.newRow();

        // Update accumulators for overall totals
        this.totalBenchmarkCount += benchmarksMap.size;
        this.totalSuccessfulBenchmarkCount += countSuccessful;
        this.allBenchmarkPeriodsSeconds.push(...benchmarkPeriodsSeconds);
        this.totalSumRuntimeSeconds += sumRuntime;
    }

    /**
     * Logs the overall summary (aggregating all suites) and saves it to disk.
     * This will also record any pending suites.
     */
    public recordResultsSummary(): void {
        for (const [key] of this.inProgressSuites) {
            this.recordSuiteResults(key);
        }

        const countFailure: number = this.totalBenchmarkCount - this.totalSuccessfulBenchmarkCount;
        this.overallSummaryTable.cell("suite name", "total");
        const totalGeometricMeanNanoseconds = geometricMean(this.allBenchmarkPeriodsSeconds) * 1e9;
        let geometricMeanString: string = prettyNumber(totalGeometricMeanNanoseconds, 1);
        if (countFailure > 0) {
            geometricMeanString = `*${geometricMeanString}`;
        }
        this.overallSummaryTable.cell("geometric mean (ns)", geometricMeanString, Table.padLeft);
        this.overallSummaryTable.cell(
            "# of passed tests",
            `${this.totalSuccessfulBenchmarkCount} out of ${this.totalBenchmarkCount}`,
            Table.padLeft,
        );
        this.overallSummaryTable.cell(
            "total time (s)",
            `${prettyNumber(this.totalSumRuntimeSeconds, 1)}`,
            Table.padLeft,
        );
        this.overallSummaryTable.newRow();
        console.log(`\n\n${bold("Overall summary")}`);
        console.log(`\n${this.overallSummaryTable.toString()}`);
        if (countFailure > 0) {
            console.log(
                `* ${countFailure} benchmark${countFailure > 1 ? "s" : ""} failed. This will skew the geometric mean.`,
            );
        }
    }

    private writeCompletedBenchmarks(suiteName: string, benchmarks: Map<string, BenchmarkData>): string {
        const outputFriendlyBenchmarks: unknown[] = [];
        // Filter successful benchmarks and ready them for output to file
        const successful = Benchmark.filter(Array.from(benchmarks.values()), "successful");
        benchmarks.forEach((value: BenchmarkData, key: string) => {
            if (successful.includes(value)) {
                outputFriendlyBenchmarks.push(this.outputFriendlyObjectFromBenchmark(key, value));
            }
        });
        // Use the suite name as a filename, but first replace non-alphanumerics with underscores
        const suiteNameEscaped: string = suiteName.replace(/[^\da-z]/gi, "_");
        const outputContentString: string = JSON.stringify(
            { suiteName, benchmarks: outputFriendlyBenchmarks },
            undefined,
            4,
        );

        // If changing this or the result file logic in general,
        // be sure to update the glob used to look for output files in the perf pipeline.
        const outputFilename = `${suiteNameEscaped}_perfresult.json`;
        const fullPath: string = path.join(this.outputDirectory, outputFilename);
        fs.writeFileSync(fullPath, outputContentString);
        return fullPath;
    }

    /**
     * The Benchmark object contains a lot of data we don't need and also has vague names, so
     * this method extracts the necessary data and provides friendlier names.
     */
    private outputFriendlyObjectFromBenchmark(
        benchmarkName: string,
        benchmark: BenchmarkData,
    ): Record<string, unknown> {
        const obj = {
            iterationsPerSecond: benchmark.hz,
            stats: this.outputFriendlyObjectFromStats(benchmark.stats),
            iterationCountPerSample: benchmark.count,
            numSamples: benchmark.stats.sample.length,
            benchmarkName,
            totalTimeSeconds: benchmark.times.elapsed,
        };
        return obj;
    }

    /**
     * The Benchmark.Stats object contains a lot of data we don't need and also has vague names,
     * so this method extracts the necessary data and provides friendlier names.
     */
    private outputFriendlyObjectFromStats(benchmarkStats: Benchmark.Stats): Record<string, unknown> {
        const obj = {
            marginOfError: benchmarkStats.moe,
            relatedMarginOfError: benchmarkStats.rme,
            arithmeticMean: benchmarkStats.mean,
            standardErrorOfMean: benchmarkStats.sem,
            variance: benchmarkStats.variance,
            standardDeviation: benchmarkStats.deviation,
            sample: benchmarkStats.sample,
        };
        return obj;
    }
}
