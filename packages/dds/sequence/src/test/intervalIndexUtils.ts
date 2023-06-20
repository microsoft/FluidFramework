/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
import { strict as assert } from "assert";
import { v4 as uuid } from "uuid";
import { IRandom } from "@fluid-internal/stochastic-test-utils";
import { PropertySet } from "@fluidframework/merge-tree";
import { Interval } from "../intervalCollection";

const reservedIntervalIdKey = "intervalId";

interface RandomIntervalOptions {
	random: IRandom;
	count: number;
	min: number;
	max: number;
}

/**
 * Asserts that the results match the expected endpoints or intervals.
 * @param results - The generated intervals to compare.
 * @param expectedEndpoints - The expected start and end points or intervals.
 */
export function assertPlainNumberIntervals(
	results: Interval[],
	expectedEndpoints: { start: number; end: number }[] | Interval[],
): void {
	assert.equal(results.length, expectedEndpoints.length, "Mismatched result count");
	for (let i = 0; i < results.length; ++i) {
		assert(results[i]);
		assert.equal(results[i].start, expectedEndpoints[i].start, "mismatched start");
		assert.equal(results[i].end, expectedEndpoints[i].end, "mismatched end");
	}
}

/**
 * Creates a new (regular) Interval object with the specified start and end values.
 * @param start - The start value of the interval.
 * @param end - The end value of the interval.
 * @returns The created Interval object.
 */
export function createTestInterval(start: number, end: number): Interval {
	const props: PropertySet = {};
	props[reservedIntervalIdKey] = [uuid()];

	return new Interval(start, end, props);
}

/**
 * Generates random intervals based on the randomness-related options.
 * @param options - The options for generating random intervals.
 * @returns An array of generated Interval objects.
 */
export function generateRandomIntervals(options: RandomIntervalOptions) {
	const intervals: Interval[] = [];
	const { random, count, min, max } = options;

	for (let i = 0; i < count; ++i) {
		const start = random.integer(min, max);
		const end = random.integer(start, max);
		const interval = createTestInterval(start, end);
		intervals.push(interval);
	}

	return intervals;
}
