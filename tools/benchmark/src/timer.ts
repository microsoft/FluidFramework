/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { getArrayStatistics } from "./RunnerUtilities";

/**
 * @public
 */
export interface Timer<T = unknown> {
	now(): T;
	toSeconds(before: T, after: T): number;
}

const timers: Timer[] = [];
{
	const nodeTimer = globalThis.process?.hrtime;
	if (nodeTimer !== undefined) {
		const timer: Timer<bigint> = {
			now: () => nodeTimer.bigint(),
			toSeconds: (before: bigint, after: bigint) => Number(after - before) / 1e9,
		};
		timers.push(timer);
	}

	const performance = globalThis.performance;
	if (performance !== undefined) {
		const timer: Timer<DOMHighResTimeStamp> = {
			now: () => performance.now(),
			toSeconds: (before, after) => (after - before) / 1e3,
		};
		timers.push(timer);
	}
}

if (timers.length === 0) {
	throw new Error("Unable to find a working timer.");
}

const timersWithResolution = timers.map((timer) => ({
	timer,
	resolution: getResolution(timer),
}));

// Pick timer with highest resolution.
timersWithResolution.sort((a, b) => a.resolution - b.resolution);
export const timer = timersWithResolution[0].timer;

// Approach based on Benchmark.js:
// Resolve time span required to achieve a percent uncertainty of at most 1%.
// For more information see http://spiff.rit.edu/classes/phys273/uncert/uncert.html.
export const defaultMinimumTime = Math.max(timersWithResolution[0].resolution / 2 / 0.01, 0.05);

/**
 * Gets the current timer's minimum resolution in seconds.
 *
 * This may be longer than the actual minimum resolution for high resolution timers,
 * and instead amounts the overhead of how long measuring takes.
 * Either way, this is a conservative estimate of timer resolution.
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
