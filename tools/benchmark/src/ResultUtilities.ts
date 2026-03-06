/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { BenchmarkResult, BenchmarkError, CollectedData, Measurement } from "./ResultTypes.js";
import { ValueType } from "./ResultTypes.js";
import { timer } from "./timer.js";

/**
 * Runs a benchmark function, measuring its total execution time and capturing either its
 * {@link CollectedData} result (with an appended "Test Duration" measurement) or any thrown exception as a {@link BenchmarkError}.
 * @remarks
 * Useful for wrapping the body of benchmarks.
 * Mocha users can use {@link benchmarkIt}, which is built on this.
 * @public
 */
export async function captureResults(
	f: () => CollectedData | Promise<CollectedData>,
	durationMeasurementName?: string,
): Promise<{ result: BenchmarkResult; exception?: Error }> {
	const startTime = timer.now();

	let data: CollectedData;
	try {
		data = await f();
	} catch (error) {
		const benchmarkError: BenchmarkError = { error: (error as Error).message };
		return { result: benchmarkError, exception: error as Error };
	}

	const elapsedSeconds = timer.toSeconds(startTime, timer.now());

	const elapsedMeasurement: Measurement = {
		name: durationMeasurementName ?? testDurationName,
		value: elapsedSeconds,
		units: "seconds",
		type: ValueType.SmallerIsBetter,
		significance: "Diagnostic",
	};
	const result: CollectedData = [...data, elapsedMeasurement];

	return { result };
}

export const testDurationName = "Test Duration";
