/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { isInPerformanceTestingMode } from "./Configuration.js";

/*
 * Common code for benchmarks which collect samples to approximate a value.
 * Typically this involves running the benchmark multiple times, and collecting many approximate values,
 * then approximating some population statistic (like a mean, minimum, mean discarding outliers etc.) using those samples.
 */

/**
 * Contains the samples of all measurements we track for a given benchmark (a test which was potentially iterated
 * several times). Each property is an array and all should be the same length, which is the number of iterations
 * done during the benchmark.
 */
export interface Stats {
	/**
	 * Margin of error.
	 */
	readonly marginOfError: number;

	/**
	 * Margin of error as a percentage of the mean.
	 */
	readonly marginOfErrorPercent: number;

	/**
	 * Standard error of the mean.
	 */
	readonly standardErrorOfMean: number;

	/**
	 * Standard deviation.
	 */
	readonly standardDeviation: number;

	/**
	 * Arithmetic mean.
	 */
	readonly arithmeticMean: number;

	/**
	 * Sample values.
	 */
	readonly samples: readonly number[];

	/**
	 * Variance.
	 */
	readonly variance: number;

	/**
	 * Maximum value in the sample.
	 */
	readonly max: number;

	/**
	 * Minimum value in the sample.
	 */
	readonly min: number;
}

/**
 * T-Distribution two-tailed critical values for 95% confidence.
 * For more info see http://www.itl.nist.gov/div898/handbook/eda/section3/eda3672.htm.
 */
const tTable = {
	"1": 12.706,
	"2": 4.303,
	"3": 3.182,
	"4": 2.776,
	"5": 2.571,
	"6": 2.447,
	"7": 2.365,
	"8": 2.306,
	"9": 2.262,
	"10": 2.228,
	"11": 2.201,
	"12": 2.179,
	"13": 2.16,
	"14": 2.145,
	"15": 2.131,
	"16": 2.12,
	"17": 2.11,
	"18": 2.101,
	"19": 2.093,
	"20": 2.086,
	"21": 2.08,
	"22": 2.074,
	"23": 2.069,
	"24": 2.064,
	"25": 2.06,
	"26": 2.056,
	"27": 2.052,
	"28": 2.048,
	"29": 2.045,
	"30": 2.042,
	"infinity": 1.96,
};

/**
 * Compute statistics for an array of numbers.
 * This assumes the data is a sample taken from an infinite population and thus reports sample variance.
 *
 * @param array - List of numbers for which to compute the statistics.
 * @param fractionOfSamplesToUse - Percentage of samples to use to get the statistics. The samples at the extremes
 * (lowest, highest) are the ones that get discarded. If an odd number of samples need to be discarded, 1 more sample
 * is discarded from the higher end than the lower end.
 *
 * @remarks
 * This outputs the same object that the Benchmark.js library does.
 */
export function getArrayStatistics(array: number[], fractionOfSamplesToUse: number = 1): Stats {
	if (fractionOfSamplesToUse < 0.1 || fractionOfSamplesToUse > 1) {
		throw new Error("fractionOfSamplesToUse must be between 0.1 and 1 (inclusive)");
	}
	let finalSamples = array;

	// Drop samples if indicated
	if (fractionOfSamplesToUse < 1) {
		// Need to provide an explicit compare function so numbers aren't sorted lexicographically. Also,
		// spread-copy the array because sort() works in place and we don't want to mutate the original array.
		finalSamples = [...array].sort((a, b) => a - b);
		const n = finalSamples.length;
		const samplesToDrop = Math.min(Math.round(n * (1 - fractionOfSamplesToUse)), n - 1);
		finalSamples = finalSamples.splice(Math.floor(samplesToDrop / 2), n - samplesToDrop);
	}

	const n = finalSamples.length;
	let max = Number.NEGATIVE_INFINITY;
	let min = Number.POSITIVE_INFINITY;
	let mean = 0;
	for (const x of finalSamples) {
		mean += x;
		if (x > max) {
			max = x;
		}
		if (x < min) {
			min = x;
		}
	}
	mean /= n;

	// We want the the sample variance, not population variance (since the dataset is only a subset of the infinite population of possible samples).
	// Therefore there is additional variance due to how the population is sampled which is accounted for by using `n - 1` here,
	// See https://en.wikipedia.org/wiki/Variance#Population_variance_and_sample_variance.
	const variance = finalSamples.map((x) => (x - mean) ** 2).reduce((a, b) => a + b) / (n - 1);
	const deviation = Math.sqrt(variance);
	const sem = deviation / Math.sqrt(n); // Standard Error of the Mean
	const df = n - 1; // Degrees of Freedom
	const propName = df === 0 ? "1" : df.toString();
	const critical = (tTable[propName] as number) ?? tTable.infinity;
	const moe = sem * critical; // Margin of Error
	const marginOfErrorPercent = (moe / Math.abs(mean)) * 100; // Relative Margin of Error

	return {
		arithmeticMean: mean,
		variance,
		standardDeviation: deviation,
		marginOfError: moe,
		standardErrorOfMean: sem,
		samples: finalSamples,
		marginOfErrorPercent,
		max,
		min,
	};
}

export function brandMeasurementNameForMode(name: string): string {
	if (isInPerformanceTestingMode) {
		return name;
	}
	return `${name} (Inaccurate: not in Performance Testing Mode. Set --perfMode flag to enable accurate measurements.)`;
}
