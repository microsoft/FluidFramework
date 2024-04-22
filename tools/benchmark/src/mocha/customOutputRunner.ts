/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Test } from "mocha";
import { timer } from "../timer";

/**
 * Options to configure a benchmark that reports custom measurements.
 *
 * @alpha
 */
export interface CustomBenchmarkOptions {
	only: boolean;
	title: string;
	runBenchmark: (reporter: IMeasurementReporter) => Promise<void>;
}
/**
 * This is a wrapper for Mocha's `it` function which runs the specified function `options.runBenchmark`
 * and gives it full control over the measurements that will be reported as benchmark output.
 *
 * @remarks
 * Tests created with this function get tagged with '\@CustomBenchmark', so mocha's --grep/--fgrep
 * options can be used to only run this type of tests by filtering on that value.
 *
 * @alpha
 */
export function benchmarkCustom(options: CustomBenchmarkOptions): Test {
	const itFunction = options.only === true ? it.only : it;
	const test = itFunction(`${options.title} @CustomBenchmark`, async () => {
		const customMeasurements: Record<string, number> = {};
		const reporter: IMeasurementReporter = {
			addMeasurement: (key: string, value: number) => {
				if (key in customMeasurements) {
					throw new Error(`Measurement key '${key}' was already used.`);
				}
				customMeasurements[key] = value;
			},
		};

		const startTime = timer.now();
		await options.runBenchmark(reporter);

		const results: CustomBenchmarkResults = {
			aborted: false,
			totalRunTimeMs: timer.toSeconds(startTime, timer.now()) * 1000,
			customMeasurements,
		};

		test.emit("benchmark end", results);
	});
	return test;
}

/**
 * Allows the benchmark code to report custom measurements.
 *
 * @alpha
 */
export interface IMeasurementReporter {
	/**
	 * Adds a custom measurement to the benchmark output.
	 * @param key - Key to uniquely identify the measurement.
	 * @param value - Measurement value.
	 *
	 * @remarks
	 * A given key should be used only once per benchmark.
	 * Trying to add a measurement with a key that was already used will throw an error.
	 */
	addMeasurement(key: string, value: number): void;
}

/**
 * Contains the result data for a benchmark with custom measurements.
 */
export interface CustomBenchmarkResults {
	// TODO: aborted, error, and totalRunTimeMs apply to any kind of benchmark (runtime, memory, custom)
	// so they could go in a base interface
	aborted: boolean;
	error?: Error;
	totalRunTimeMs: number;

	/**
	 * Custom measurements that represent the result of the benchmark.
	 */
	customMeasurements: Record<string, number>;
}
