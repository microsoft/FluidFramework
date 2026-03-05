/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, assertProperUse } from "../assert.js";
import {
	isInPerformanceTestingMode,
	type BenchmarkDescription,
	type BenchmarkFunction,
} from "../Configuration.js";
import { ValueType, type CollectedData, type Measurement } from "../ResultTypes.js";
import { brandMeasurementNameForMode, getArrayStatistics } from "../sampling.js";
import { type MemoryUseCallbacks, type MemoryUseBenchmark } from "./configuration.js";

interface MemoryMeasurement {
	before: number;
	while: number;
	after: number;
	gcCalls: number;
	gcIterations: number;
	gcMaxIterations: number;
	gcMaxLastDelta: number;
}

function getBytesUsed(): number {
	const usage = process.memoryUsage();
	// Array buffers should count, and are not included in heapUsed, so add them in.
	return usage.heapUsed + usage.arrayBuffers;
}

const gcOptionsAsync = { type: "major", execution: "async" } as const;
const gcOptions = { type: "major" } as const;

async function getUsage(
	enableAsyncGC: boolean,
): Promise<{ used: number; gcIterations: number; lastDelta: number }> {
	const gc = global?.gc;
	if (gc === undefined) {
		assert(
			!isInPerformanceTestingMode,
			"Garbage collection is not exposed. Run Node with --expose-gc to enable this feature.",
		);
		return { used: getBytesUsed(), gcIterations: 0, lastDelta: Number.NaN };
	}

	let counter = 0;
	let usedBefore = 0;
	while (true) {
		const usedAfter = getBytesUsed();
		const change = usedAfter - usedBefore;
		const threshold = Math.max(enableAsyncGC ? 96 : 0, (counter - 2) * 32);
		if (
			counter > 0 &&
			(!isInPerformanceTestingMode ||
				usedAfter === usedBefore ||
				Math.abs(change) <= threshold)
		) {
			return { used: usedAfter, gcIterations: counter, lastDelta: change };
		}
		usedBefore = usedAfter;
		counter++;

		// Experiments have shown that there are two ways to ensure garbage collection including the FinalizationRegistry, is run.
		// 1. a sync GC then a wait of 8 seconds (but this sometimes fails after multiple runs unless a debugger takes a heap snapshot, possible due to some JIT optimization that breaks it).
		// 2. two async GCs in a row.
		// Since the second option is both more robust and faster, that is what is used here.
		// In this case, the second iteration of this loop should pick up the finalizers.

		if (enableAsyncGC) {
			await gc(gcOptionsAsync);
		}
		gc(gcOptions);
		gc();
	}
}

const defaults: Required<Omit<MemoryUseBenchmark, "benchmarkFn">> = {
	enableAsyncGC: false,
	logProcessedData: false,
	logRawData: false,
	warmUpIterations: 12,
	keepIterations: 10,
};

/**
 * Runs the benchmark.
 * @remarks
 * To collect accurate data, set {@link isInPerformanceTestingMode} to true.
 * @public
 */
export async function collectMemoryUseData(argsIn: MemoryUseBenchmark): Promise<CollectedData> {
	const args = { ...defaults, ...argsIn }; // TODO: we probably want to not include explicit undefined fields from argsIn.
	const data: MemoryMeasurement[] = [];
	const unset = -1;

	// Likely due to JIT behavior, the first couple, then often the 11 and 12 iterations tend to be different (13 for async GC cases).
	// To mitigate this we trim some samples from the beginning.
	const trimCount = isInPerformanceTestingMode ? args.warmUpIterations : 0;
	const count = trimCount + (isInPerformanceTestingMode ? args.keepIterations : 1);
	// Preallocate space for data to avoid allocations during collection.
	for (let i = 0; i < count; i++) {
		data.push({
			before: unset,
			while: unset,
			after: unset,
			gcIterations: 0,
			gcMaxIterations: 0,
			gcMaxLastDelta: 0,
			gcCalls: 0,
		});
	}
	let sampleIndex = -1;

	async function getUsageInner(): Promise<number> {
		const usage = await getUsage(args.enableAsyncGC);
		data[sampleIndex].gcIterations += usage.gcIterations;
		data[sampleIndex].gcMaxIterations = Math.max(
			data[sampleIndex].gcMaxIterations,
			usage.gcIterations,
		);
		if (Math.abs(usage.lastDelta) > Math.abs(data[sampleIndex].gcMaxLastDelta)) {
			data[sampleIndex].gcMaxLastDelta = Math.abs(usage.lastDelta);
		}
		data[sampleIndex].gcCalls++;
		return usage.used;
	}

	const state: MemoryUseCallbacks = {
		async beforeAllocation() {
			assertProperUse(
				data[sampleIndex].before === unset &&
					data[sampleIndex].while === unset &&
					data[sampleIndex].after === unset,
				"beforeAllocation should only be called once and before the other callbacks",
			);
			data[sampleIndex].before = await getUsageInner();
		},
		async whileAllocated() {
			assertProperUse(
				data[sampleIndex].before !== unset &&
					data[sampleIndex].while === unset &&
					data[sampleIndex].after === unset,
				"whileAllocated should only be called once and between the other callbacks",
			);
			data[sampleIndex].while = await getUsageInner();
		},
		async afterDeallocation() {
			assertProperUse(
				data[sampleIndex].before !== unset &&
					data[sampleIndex].while !== unset &&
					data[sampleIndex].after === unset,
				"afterDeallocation should only be called once and after the other callbacks",
			);
			data[sampleIndex].after = await getUsageInner();
		},
		continue(): boolean {
			sampleIndex++;
			return sampleIndex < count;
		},
	};

	// Outside of actual measurement, async GC does not introduce bias or too much overhead,
	// and can protect against cross test contamination due to finalizers.
	// This also seems to help with the first test, preventing if from requiring an extra GC iteration.
	await getUsage(true);

	await args.benchmarkFn(state);

	assert(
		sampleIndex === count,
		`Expected benchmarkFn to run the benchmark ${count} times, but it ran it ${sampleIndex} times.`,
	);

	const usedAfter = data[0].after !== unset;

	for (const measurement of data) {
		assertProperUse(
			measurement.before !== unset,
			`Expected benchmarkFn to call "beforeAllocation" callback for each sample.`,
		);

		assertProperUse(
			measurement.while !== unset,
			`Expected benchmarkFn to call "whileAllocated" callback for each sample.`,
		);

		assertProperUse(
			(measurement.after !== unset) === usedAfter,
			`Expected benchmarkFn to call "usedAfter" on all or none of the samples, but it was called on some samples and not others.`,
		);
	}

	// Discard first few samples as warmup, and compute statistics on the rest.
	const trimmed = data.slice(trimCount);

	const processedAll = data.map((x) => {
		const allocatedBytes = x.while - x.before;
		const freedBytes = usedAfter ? x.while - x.after : allocatedBytes;
		return { allocatedBytes, freedBytes, meanBytes: (allocatedBytes + freedBytes) / 2 };
	});

	const processed: ProcessedMeasurement[] = processedAll.slice(trimCount);

	// When debugging the behaviors, inspecting this can be helpful to see if there is noise coming from specific iterations and the trim needs adjusting.
	if (args.logRawData) {
		console.log(`Raw data (First ${trimCount} rows discarded):`);
		console.log(data);
	}
	if (args.logProcessedData) {
		console.log(`Processed data (First ${trimCount} rows discarded):`);
		console.log(processedAll);
	}

	const allocatedStats = getArrayStatistics(processed.map((x) => x.allocatedBytes));
	const freedStats = getArrayStatistics(processed.map((x) => x.freedBytes));

	// Split up data into "first" and "last" halves and compute stats on those
	// to see if there is a trend in the data that might indicate leaking memory across iterations.
	const sizeOfHalf = Math.max(1, Math.floor(processed.length / 2));
	const firstHalfSize = getArrayStatistics(
		processed.slice(0, sizeOfHalf).map((x) => x.meanBytes),
	);
	const lastHalfSize = getArrayStatistics(processed.slice(-sizeOfHalf).map((x) => x.meanBytes));
	assert(firstHalfSize.samples.length === sizeOfHalf, `invalid first half size`);
	assert(lastHalfSize.samples.length === sizeOfHalf, `invalid last half size`);

	const averageIndexInStart = (0 + (sizeOfHalf - 1)) / 2;
	const averageIndexInEnd = (processed.length - sizeOfHalf + (processed.length - 1)) / 2;
	const iterationsBetweenStartAndEndStats = averageIndexInEnd - averageIndexInStart;

	const sizeStartBeforeMeasurement = getArrayStatistics(
		trimmed.slice(0, sizeOfHalf).map((x) => x.before),
	);
	const sizeEndBeforeMeasurement = getArrayStatistics(
		trimmed.slice(-sizeOfHalf).map((x) => x.before),
	);
	const leak =
		sizeEndBeforeMeasurement.arithmeticMean - sizeStartBeforeMeasurement.arithmeticMean;
	const leakPerIteration = leak / iterationsBetweenStartAndEndStats;

	const meanStats = getArrayStatistics(processed.map((x) => x.meanBytes));

	const additional: Measurement[] = [
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
		{
			name: "Standard Deviation",
			value: meanStats.standardDeviation,
			units: "bytes",
			type: ValueType.SmallerIsBetter,
		},
		{
			name: "Leak per Iteration",
			value: leakPerIteration,
			units: "bytes",
			type: ValueType.SmallerIsBetter,
		},
		{
			name: "Growth per Iteration",
			value:
				(lastHalfSize.arithmeticMean - firstHalfSize.arithmeticMean) /
				iterationsBetweenStartAndEndStats,
			units: "bytes",
			type: ValueType.SmallerIsBetter,
		},
		{
			name: "Max GCs",
			value: Math.max(...data.map((x) => x.gcMaxIterations)),
			units: "count",
			type: ValueType.SmallerIsBetter,
		},
		{
			name: "Mean GCs",
			value: getArrayStatistics(trimmed.map((x) => x.gcIterations / x.gcCalls))
				.arithmeticMean,
			type: ValueType.SmallerIsBetter,
		},
		{
			name: "Max Last GC Delta",
			value: Math.max(...trimmed.map((x) => x.gcMaxLastDelta)),
			units: "bytes",
			type: ValueType.SmallerIsBetter,
		},
	];

	if (usedAfter) {
		additional.push(
			{
				name: "Mean Allocated",
				value: allocatedStats.arithmeticMean,
				units: "bytes",
				type: ValueType.SmallerIsBetter,
			},
			{
				name: "Mean Freed",
				value: freedStats.arithmeticMean,
				units: "bytes",
				type: ValueType.SmallerIsBetter,
			},
		);
	}

	return {
		primary: {
			name: brandMeasurementNameForMode("Mean Usage"),
			value: meanStats.arithmeticMean,
			units: "bytes",
			type: ValueType.SmallerIsBetter,
		},
		additional,
	};
}

interface ProcessedMeasurement {
	allocatedBytes: number;
	freedBytes: number;
	meanBytes: number;
}

let warmedUp = false;
async function warmupCollectMemoryUseData(): Promise<void> {
	if (!warmedUp) {
		await collectMemoryUseData({
			benchmarkFn: async (callbacks) => {
				while (callbacks.continue()) {
					await callbacks.beforeAllocation();
					await callbacks.whileAllocated();
					await callbacks.afterDeallocation();
				}
			},
		});
		warmedUp = true;
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
		run: async () => {
			// The first time collectMemoryUseData runs, it causes some memory instability, likely related to JITing.
			// We can mitigate that by running it once, before we start collecting data, to warm up the system.
			// Warming up of the function contained in `args` is not needed here since collectMemoryUseData does that internally.
			await warmupCollectMemoryUseData();
			return collectMemoryUseData(args);
		},
	};
}
