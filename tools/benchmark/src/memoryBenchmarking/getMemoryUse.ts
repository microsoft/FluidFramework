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
import { ValueType, type CollectedData, type Measurement } from "../reportTypes.js";
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

		// Experiments have found two ways to ensure GC runs including the FinalizationRegistry finalizers:
		// 1. A sync GC then an 8-second wait (unreliable across multiple runs unless a debugger takes a heap snapshot, possibly due to JIT).
		// 2. Two async GCs in a row.
		// Option 2 is both more robust and faster, so it is used here.
		// The second iteration of this loop will pick up any pending finalizers.

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
 * Like {...defaults, ...obj} but only applies the properties from `obj` that are not undefined, allowing `undefined` to be used to indicate "use the default" for individual properties.
 * @remarks
 * This allows explicit undefined and omitted settings to work the same, which is what the typescript typing expects.
 * Do not use this when the ability to overwrite a default with `undefined` is needed, as it will not work correctly in that case.
 */
function applyDefaults<T extends object>(
	obj: T,
	defaults: { [K in keyof T as undefined extends T[K] ? K : never]-?: NonNullable<T[K]> },
): Required<T> {
	const result = { ...defaults };
	for (const [key, value] of Object.entries(obj) as [keyof T, T[keyof T]][]) {
		if (value !== undefined) {
			(result as T)[key] = value;
		}
	}
	return result as T as Required<T>;
}

/**
 * Runs a memory usage benchmark and returns the collected heap measurements.
 * @remarks
 * Collecting accurate data requires running with `--perfMode` (see {@link isInPerformanceTestingMode}).
 * Without it, only a single iteration is run and the results are not statistically meaningful.
 * @public
 */
export async function collectMemoryUseData(argsIn: MemoryUseBenchmark): Promise<CollectedData> {
	const args = applyDefaults(argsIn, defaults);
	const data: MemoryMeasurement[] = [];
	const unset = -1;

	// Likely due to JIT behavior, the first couple of iterations and often the 11th and 12th tend to be outliers (13th for async GC cases).
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
	// and can protect against cross-test contamination due to finalizers.
	// This also seems to help with the first test, preventing it from requiring an extra GC iteration.
	await getUsage(true);

	await args.benchmarkFn(state);

	assert(
		sampleIndex === count,
		`Expected benchmarkFn to run the benchmark ${count} times, but it ran it ${sampleIndex} times.`,
	);

	const hasDeallocationData = data[0].after !== unset;

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
			(measurement.after !== unset) === hasDeallocationData,
			`Expected benchmarkFn to call "afterDeallocation" on all or none of the samples, but it was called on some samples and not others.`,
		);
	}

	// Discard first few samples as warmup, and compute statistics on the rest.
	const trimmed = data.slice(trimCount);

	const processedAll = data.map((x) => {
		const allocatedBytes = x.while - x.before;
		const freedBytes = hasDeallocationData ? x.while - x.after : allocatedBytes;
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
	const firstHalfStats = getArrayStatistics(
		processed.slice(0, sizeOfHalf).map((x) => x.meanBytes),
	);
	const lastHalfStats = getArrayStatistics(processed.slice(-sizeOfHalf).map((x) => x.meanBytes));
	assert(firstHalfStats.samples.length === sizeOfHalf, `invalid first half size`);
	assert(lastHalfStats.samples.length === sizeOfHalf, `invalid last half size`);

	const averageIndexInStart = (0 + (sizeOfHalf - 1)) / 2;
	const averageIndexInEnd = (processed.length - sizeOfHalf + (processed.length - 1)) / 2;
	const iterationsBetweenStartAndEndStats = averageIndexInEnd - averageIndexInStart;

	const startBeforeStats = getArrayStatistics(trimmed.slice(0, sizeOfHalf).map((x) => x.before));
	const endBeforeStats = getArrayStatistics(trimmed.slice(-sizeOfHalf).map((x) => x.before));
	const leak = endBeforeStats.arithmeticMean - startBeforeStats.arithmeticMean;
	const leakPerIteration = leak / iterationsBetweenStartAndEndStats;

	const meanStats = getArrayStatistics(processed.map((x) => x.meanBytes));

	const additional: Measurement[] = [
		{
			name: "Samples",
			value: meanStats.samples.length,
			units: "count",
			significance: "Diagnostic",
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
			significance: "Diagnostic",
		},
		{
			name: "Growth per Iteration",
			value:
				(lastHalfStats.arithmeticMean - firstHalfStats.arithmeticMean) /
				iterationsBetweenStartAndEndStats,
			units: "bytes",
			type: ValueType.SmallerIsBetter,
			significance: "Diagnostic",
		},
		{
			name: "Max GCs",
			value: Math.max(...data.map((x) => x.gcMaxIterations)),
			units: "count",
			type: ValueType.SmallerIsBetter,
			significance: "Diagnostic",
		},
		{
			name: "Mean GCs",
			value: getArrayStatistics(trimmed.map((x) => x.gcIterations / x.gcCalls))
				.arithmeticMean,
			type: ValueType.SmallerIsBetter,
			significance: "Diagnostic",
		},
		{
			name: "Max Last GC Delta",
			value: Math.max(...trimmed.map((x) => x.gcMaxLastDelta)),
			units: "bytes",
			type: ValueType.SmallerIsBetter,
			significance: "Diagnostic",
		},
	];

	if (hasDeallocationData) {
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

	return [
		{
			name: brandMeasurementNameForMode("Mean Usage"),
			value: meanStats.arithmeticMean,
			units: "bytes",
			type: ValueType.SmallerIsBetter,
			significance: "Primary",
		},
		...additional,
	];
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
