/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getArrayStatistics } from "./sampling.js";

/**
 * Timer that captures timestamps and converts durations between them into seconds.
 * @remarks
 * The type parameter `T` is the type of timestamp captured by {@link Timer.now}.
 *
 * Different environments expose different timer primitives (e.g., `bigint` from
 * `process.hrtime.bigint()` in Node.js, or `DOMHighResTimeStamp` from
 * `performance.now()` in browsers), so this interface is generic to accommodate both.
 * @public
 */
export interface Timer<T = unknown> {
	/**
	 * Captures the current time as a raw timestamp.
	 * @remarks
	 * Call this before and after the operation you want to measure, then pass
	 * both values to {@link Timer.toSeconds} to compute the elapsed duration.
	 */
	now(): T;

	/**
	 * Converts a pair of raw timestamps into an elapsed duration in seconds.
	 * @param before - The timestamp captured before the measured operation.
	 * @param after - The timestamp captured after the measured operation.
	 * @returns The elapsed time in seconds as a floating-point number.
	 */
	toSeconds(before: T, after: T): number;
}

/**
 * A place to collect all supported timer implementations for the current platform.
 */
const timers: Timer[] = [];
{
	// Look for NodeJS high-resolution timer.
	const nodeTimer = globalThis.process?.hrtime;
	if (nodeTimer !== undefined) {
		const timer: Timer<bigint> = {
			now: () => nodeTimer.bigint(),
			toSeconds: (before: bigint, after: bigint) => Number(after - before) / 1e9,
		};
		timers.push(timer);
	}

	// Look for browser high-resolution timer.
	const performance = globalThis.performance;
	if (performance !== undefined) {
		const timer: Timer<DOMHighResTimeStamp> = {
			now: () => performance.now(),
			toSeconds: (before, after) => (after - before) / 1e3,
		};
		timers.push(timer);
	}
}

// We could add more timer fallbacks, like a Date.now() based timer,
// but all platforms we care about support one of the better ones so there is no need for now.

if (timers.length === 0) {
	throw new Error("Unable to find a working timer.");
}

const timersWithResolution = timers.map((timer) => ({
	timer,
	resolution: getResolution(timer),
}));

// Pick timer with highest resolution.
timersWithResolution.sort((a, b) => a.resolution - b.resolution);

/**
 * The best available high-resolution timer for the current environment, paired with its measured resolution.
 */
export const timerWithResolution = timersWithResolution[0];

/**
 * The best available high-resolution timer for the current environment.
 * @remarks
 * This is the timer used internally by {@link collectDurationData} and related APIs.
 */
export const timer: Timer = timerWithResolution.timer;

/**
 * Estimates the effective resolution of a timer in seconds.
 *
 * The resolution is measured empirically by repeatedly calling {@link Timer.now} in a
 * tight loop until the value changes, recording each smallest-observable delta.
 * This process is repeated 30 times and the mean of the middle 80% of samples is
 * returned to reduce the influence of outliers.
 *
 * For coarse timers this returns the actual tick granularity.
 * For high-resolution timers (e.g. `process.hrtime.bigint`) the result is dominated
 * by the call overhead rather than the clock granularity, making it a conservative
 * upper bound on the true resolution.
 *
 * @param t - The timer whose resolution should be measured.
 * @returns The estimated resolution in seconds.
 */
function getResolution(t: Timer): number {
	const sample: number[] = [];

	// Get average smallest measurable time.
	for (let index = 0; index < 30; index++) {
		let after;
		const before = t.now();
		do {
			after = t.now();
		} while (before === after);
		const delta = t.toSeconds(before, after);
		if (delta <= 0) {
			throw new Error("invalid timer");
		}
		sample.push(delta);
	}

	return getArrayStatistics(sample, 0.8).arithmeticMean;
}
