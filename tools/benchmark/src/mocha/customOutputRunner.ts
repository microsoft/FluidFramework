/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Test } from "mocha";

import {
	type BenchmarkDescription,
	type MochaExclusiveOptions,
	type Titled,
} from "../Configuration";
import type { BenchmarkData, BenchmarkError, CustomData } from "../ResultTypes";
import { prettyNumber } from "../RunnerUtilities";
import { timer } from "../timer";

/**
 * Options to configure a benchmark that reports custom measurements.
 *
 * @public
 */
export interface CustomBenchmarkOptions
	extends Titled,
		BenchmarkDescription,
		MochaExclusiveOptions {
	/**
	 * Runs the benchmark.
	 */
	run: (reporter: IMeasurementReporter) => void | Promise<unknown>;
}

/**
 * This is a wrapper for Mocha's `it` function which runs the specified function {@link CustomBenchmarkOptions.run}
 * and gives it full control over the measurements that will be reported as benchmark output.
 *
 * @remarks
 * Tests created with this function get tagged with '\@CustomBenchmark', so mocha's --grep/--fgrep
 * options can be used to only run this type of tests by filtering on that value.
 *
 * @public
 */
export function benchmarkCustom(options: CustomBenchmarkOptions): Test {
	const itFunction = options.only === true ? it.only : it;
	const test = itFunction(`${options.title} @CustomBenchmark`, async () => {
		const customData: CustomData = {};
		const reporter: IMeasurementReporter = {
			addMeasurement: (key: string, value: number) => {
				if (key in customData) {
					throw new Error(`Measurement key '${key}' was already used.`);
				}
				customData[key] = { rawValue: value, formattedValue: prettyNumber(value) };
			},
		};

		const startTime = timer.now();

		try {
			await options.run(reporter);
		} catch (error) {
			const benchmarkError: BenchmarkError = { error: (error as Error).message };

			test.emit("benchmark end", benchmarkError);

			throw error;
		}

		const elapsedSeconds = timer.toSeconds(startTime, timer.now());

		const results: BenchmarkData = {
			elapsedSeconds,
			customData,
		};

		test.emit("benchmark end", results);
	});
	return test;
}

/**
 * Allows the benchmark code to report custom measurements.
 *
 * @see {@link benchmarkCustom}
 * @see {@link CustomBenchmarkOptions.run}
 *
 * @public
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
