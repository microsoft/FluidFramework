/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import Benchmark from "benchmark";
import { assert } from "chai";
import { Suite } from "mocha";
import { benchmarkTypes, performanceTestSuiteTag, testTypes, userCategoriesSplitter } from "./Configuration";

/**
 * This file contains generic utilities of use to a mocha reporter, especially for convenient formatting of textual
 * output to the command line.
 */

const tags = [
    performanceTestSuiteTag,
    ...benchmarkTypes.map((x) => `@${x}`),
    ...testTypes.map((x) => `@${x}`)];

/**
 * Strip tags and user-specified category from a test suite's name.
 */
export const getSuiteName = (suite: Suite): string => getName(suite.fullTitle());

/**
 * Strip tags and user-specified category from the specified test/suite name.
 */
export function getName(name: string): string {
    let s = name;
    for (const tag of tags) {
        s = s.replace(tag, "");
    }
    const indexOfSplitter = s.indexOf(userCategoriesSplitter);
    if (indexOfSplitter >= 0) {
        s = s.slice(0, indexOfSplitter);
    }
    return s.trim();
}

/**
 * @returns a red version of the input string
 */
export const red = (s: string): string => `\u001b[31m${s}\u001b[0m`;

/**
 * @returns a green version of the input string
 */
export const green = (s: string): string => `\u001b[32m${s}\u001b[0m`;

/**
 * @returns a yellow version of the input string
 */
export const yellow = (s: string): string => `\u001b[33m${s}\u001b[0m`;

/**
 * @returns an italicized version of the input string
 */
export const italicize = (s: string): string => `\x1b[3m${s}\x1b[23m`;

/**
 * @returns a bolded version of the input string
 */
export const bold = (s: string): string => `\x1B[1m${s}\x1B[22m`;

/**
 * @param num - Number of characters to pad
 * @param chr - Character to use for padding (space by default)
 * @returns a padding string consisting of `num` copies of `chr`
 */
export const pad = (num: number, chr = " "): string => Array(num + 1).join(chr);

/**
 * Nicely format a decimal number to make it human-readable.
 * @param num - Number to format
 * @param numDecimals - Number of digits after the decimal point to retain
 * @public
 */
export function prettyNumber(num: number, numDecimals = 3): string {
    // Split the string to determine parts before and after the decimal
    const split: string[] = num.toFixed(numDecimals).split(".");
    // Show exponential if we have more than 9 digits before the decimal
    if (split[0].length > 9) {
        return num.toExponential(numDecimals);
    }
    // Add commas to the numbers before the decimal.
    // Since this only ever runs on strings <= 9 characters, its not a performance problem problem.
    // eslint-disable-next-line unicorn/no-unsafe-regex
    split[0] = split[0].replace(/(\d)(?=(\d{3})+$)/g, "$1,");
    return split.join(".");
}

/**
 * Computes the mean of a number of geometric values. All values must be greater than 0.
 * @param values - Set of values whose geometric mean should be computed.
 * @public
 */
export function geometricMean(values: number[]): number {
    // Compute the geometric mean of values, but do it using log and exp to reduce overflow/underflow.
    let sum = 0;
    for (const value of values) {
        assert(value > 0, "invalid value in geometricMean");
        sum += Math.log(value);
    }
    return Math.exp(sum / values.length);
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

/**
 * Compute statistics for an array of numbers. For homogeneity, it outputs the same
 * object that the Benchmark library does.
 *
 * @param array - List of numbers for which to compute the statistics.
 * @param percentageOfSamplesToUse - Percentage of samples to use to get the statistics. The samples at the extremes
 * (lowest, highest) are the ones that get discarded. If an odd number of samples need to be discarded, 1 more sample
 * is discarded from the higher end than the lower end.
 */
 export function getArrayStatistics(array: number[], percentageOfSamplesToUse: number = 1): Benchmark.Stats {
    if (percentageOfSamplesToUse < 0.1 || percentageOfSamplesToUse > 1) {
        throw new Error("percentageOfSamplesToUse must be between 0.1 and 1 (inclusive)");
    }
    let finalSamples = array;

    // Drop samples if indicated
    if (percentageOfSamplesToUse < 1) {
        // Need to provide an explicit compare function so numbers aren't sorted lexicographically. Also,
        // spread-copy the array because sort() works in place and we don't want to mutate the original array.
        finalSamples = [...array].sort((a, b) => a - b);
        const n = finalSamples.length;
        const samplesToDrop = Math.round(n * (1 - percentageOfSamplesToUse));
        finalSamples = finalSamples.splice(Math.floor(samplesToDrop / 2), n - samplesToDrop);
    }

    const n = finalSamples.length;
    let max = -Infinity;
    let min = Infinity;
    let mean = 0;
    finalSamples.forEach((x) => {
        mean += x;
        if (x > max) { max = x; }
        if (x < min) { min = x; }
    });
    mean /= n;

    const variance = finalSamples.map((x) => (x - mean) ** 2).reduce((a, b) => a + b) / n;
    const deviation = Math.sqrt(variance);
    const sem = deviation / Math.sqrt(n); // Standard Error of the Mean
    const df = n - 1; // Degrees of Freedom
    const propName = df === 0 ? "1" : df.toString();
    const critical = tTable[propName] ?? tTable.infinity;
    const moe = sem * critical; // Margin of Error
    const rme = (moe / Math.abs(mean)) * 100 || 0; // Relative Margin of Error

    return { mean, variance, deviation, moe, sem, sample: finalSamples, rme };
}
