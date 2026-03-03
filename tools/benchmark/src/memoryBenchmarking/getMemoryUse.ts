/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, assertProperUse } from "../assert";
import {
	isInPerformanceTestingMode,
	type BenchmarkDescription,
	type BenchmarkFunction,
} from "../Configuration";
import { ValueType, type CollectedData } from "../ResultTypes";
import { brandMeasurementNameForMode, getArrayStatistics } from "../sampling";
import { type MemoryUseCallbacks, type MemoryUseBenchmark } from "./configuration";

interface MemoryMeasurement {
	before: number;
	while: number;
	after: number;
}

async function getUsage(): Promise<number> {
	await runGarbageCollection();
	return process.memoryUsage().heapUsed;
}

function assertStats(condition: boolean, message: string) {
	// Quality of memory data can be trash when not in per testing mode,
	// so skip asserts based on that data unless we are in performance testing mode.
	if (isInPerformanceTestingMode) {
		assertProperUse(condition, message);
	}
}

/**
 * Runs the benchmark.
 * @remarks
 * To collect accurate data, set {@link isInPerformanceTestingMode} to true.
 * @public
 */
export async function collectMemoryUseData(args: MemoryUseBenchmark): Promise<CollectedData> {
	const data: MemoryMeasurement[] = [];
	const unset = -1;

	// TODO: something smarter.
	const count = isInPerformanceTestingMode ? 10 : 1;
	// Preallocate space for data to avoid allocations during collection.
	for (let i = 0; i < count; i++) {
		data.push({ before: unset, while: unset, after: unset });
	}
	let sampleIndex = 0;

	const state: MemoryUseCallbacks = {
		async beforeAllocation() {
			assertProperUse(
				data[sampleIndex].before === unset &&
					data[sampleIndex].while === unset &&
					data[sampleIndex].after === unset,
				"beforeAllocation should only be called once and before the other callbacks",
			);
			data[sampleIndex].before = await getUsage();
		},
		async whileAllocated() {
			assertProperUse(
				data[sampleIndex].before !== unset &&
					data[sampleIndex].while === unset &&
					data[sampleIndex].after === unset,
				"whileAllocated should only be called once and between the other callbacks",
			);
			data[sampleIndex].while = await getUsage();
		},
		async afterDeallocation() {
			assertProperUse(
				data[sampleIndex].before !== unset &&
					data[sampleIndex].while !== unset &&
					data[sampleIndex].after === unset,
				"afterDeallocation should only be called once and after the other callbacks",
			);
			data[sampleIndex].after = await getUsage();
			sampleIndex++;
		},
		continue(): boolean {
			return sampleIndex < count;
		},
	};

	await args.benchmarkFn(state);

	assert(
		sampleIndex === count,
		`Expected benchmarkFn to run the benchmark ${count} times, but it ran it ${sampleIndex} times.`,
	);

	// Discard first two samples as warmup, and compute statistics on the rest.
	const trimmed = isInPerformanceTestingMode ? data.slice(2) : data;

	const processed: ProcessedMeasurement[] = trimmed.map((x) => {
		const allocatedBytes = x.while - x.before;
		const freedBytes = x.while - x.after;
		return { allocatedBytes, freedBytes };
	});

	const allocatedStats = getArrayStatistics(processed.map((x) => x.allocatedBytes));
	const freedStats = getArrayStatistics(processed.map((x) => x.freedBytes));

	const endSize = Math.max(1, Math.floor(count / 2));
	const sizeStart = getArrayStatistics(
		processed.slice(0, endSize).map((x) => (x.allocatedBytes + x.freedBytes) / 2),
	);
	const sizeEnd = getArrayStatistics(
		processed.slice(-endSize).map((x) => (x.allocatedBytes + x.freedBytes) / 2),
	);

	assert(sizeStart.samples.length === endSize, `invalid start size`);
	assert(sizeEnd.samples.length === endSize, `invalid end size`);

	// A test might be checking that something does not use any memory.
	// In such cases noise in the data we might flag that as using negative memory or inconsistent allocation vs free size.
	// Add this threshold to avoid flagging such cases.
	const noiseThreshold = 1024;

	assertStats(
		allocatedStats.arithmeticMean > -noiseThreshold,
		"Expected positive allocation size",
	);
	assertStats(freedStats.arithmeticMean > -noiseThreshold, "Expected positive deallocation size");

	const meanStats = getArrayStatistics(
		processed.map((x) => (x.allocatedBytes + x.freedBytes) / 2),
	);
	const meanMean = meanStats.arithmeticMean;

	assertStats(
		Math.abs(sizeEnd.arithmeticMean - sizeStart.arithmeticMean) <
			meanMean * 0.4 + noiseThreshold,
		`Expected iterations of memory use benchmark to not leak memory across iterations, but sizes near start (${sizeStart.arithmeticMean} bytes) and end sizes near end (${sizeEnd.arithmeticMean} bytes) were significantly different.`,
	);

	{
		const difference = Math.abs(allocatedStats.arithmeticMean - freedStats.arithmeticMean);
		const threshold = meanMean * 0.2 + noiseThreshold;
		assertStats(
			difference <= threshold,
			`Allocated size (${allocatedStats.arithmeticMean} bytes) and freed size (${freedStats.arithmeticMean} bytes) should be similar: difference of ${difference} bytes exceeds threshold of ${threshold} bytes.`,
		);
	}

	return {
		primary: {
			name: brandMeasurementNameForMode("Mean Additional Memory Usage"),
			value: meanStats.arithmeticMean,
			units: "bytes",
			type: ValueType.SmallerIsBetter,
		},
		additional: [
			{
				name: "Samples",
				value: meanStats.samples.length,
				units: "count",
			},
			{
				name: "Margin of Error",
				value: meanStats.marginOfError,
				units: "bytes",
				type: ValueType.SmallerIsBetter,
			},
			{
				name: "Relative Margin of Error",
				value: meanStats.marginOfErrorPercent,
				units: "%",
				type: ValueType.SmallerIsBetter,
			},
		],
	};
}

interface ProcessedMeasurement {
	allocatedBytes: number;
	freedBytes: number;
}

const gcOptions = { type: "major", execution: "async" } as const;

/**
 * Run a garbage collection, if possible.
 * @remarks
 * Used to reduce heap to only retained objects to allow measuring of retained heap size.
 */
async function runGarbageCollection(): Promise<void> {
	const gc = global?.gc;
	if (gc === undefined) {
		assert(
			!isInPerformanceTestingMode,
			"Garbage collection is not exposed. Run Node with --expose-gc to enable this feature.",
		);
	} else {
		// Experiments have shown that there are two ways to ensure garbage collection including the FinalizationRegistry, is run.
		// 1. a sync GC then a wait of 8 seconds (but this sometimes fails after multiple runs unless a debugger takes a heap snapshot, possible due to some JIT optimization that breaks it).
		// 2. two async GCs in a row.
		// Since the second option is both more robust and faster, that is what is used here.
		for (let index = 0; index < 2; index++) {
			await gc(gcOptions);
		}
	}
}

/**
 * Configures a benchmark that uses {@link collectMemoryUseData}
 * to measure memory usage and returns the results in a format suitable for reporting via {@link benchmarkIt}.
 * @public
 */
export function benchmarkMemoryUse(
	args: MemoryUseBenchmark,
): BenchmarkDescription & BenchmarkFunction {
	return {
		category: "Memory",
		run: async (): Promise<CollectedData> => await collectMemoryUseData(args),
	};
}
