/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { v4 as uuid } from "uuid";
import { PropertySet, Client } from "@fluidframework/merge-tree";
import {
	IIntervalHelpers,
	Interval,
	createStartpointInRangeIndex,
	createInterval,
} from "../intervalCollection";

const reservedIntervalIdKey = "intervalId";

class TestStartpointInRangeIndex {
	private readonly intervals: Interval[];

	constructor() {
		this.intervals = [];
	}

	add(interval: Interval) {
		this.intervals.push(interval);
	}

	findIntervalsWithStartpointInRange(start: number, end: number): Interval[] {
		return this.intervals.filter(
			(interval) => interval.start >= start && interval.start <= end,
		);
	}
}

function createTestInterval(start: number, end: number): Interval {
	const props: PropertySet = {};
	props[reservedIntervalIdKey] = [uuid()];

	return new Interval(start, end, props);
}

function assertPlainNumberIntervals(
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

function generateRandomIntervals(count: number, rangeStart: number, rangeEnd: number) {
	const intervals: Interval[] = [];

	while (intervals.length < count) {
		const start = getRandomNumber(rangeStart, rangeEnd);
		const end = getRandomNumber(start, rangeEnd);
		const interval = createTestInterval(start, end);
		/**
		 * Currently avoid using duplicate intervals due to the bug:
		 * https://dev.azure.com/fluidframework/internal/_workitems/edit/4477
		 */
		if (
			!intervals.some(
				(existing) => existing.start === interval.start && existing.end === interval.end,
			)
		) {
			intervals.push(interval);
		}
	}

	return intervals;
}

function getRandomNumber(min: number, max: number): number {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

describe("Support querying intervals with startpoints in a specified range", () => {
	let helpers: IIntervalHelpers<Interval>;
	let startpointInRangeIndex;
	let compareFn;
	let results;

	beforeEach(() => {
		helpers = {
			compareEnds: (a: Interval, b: Interval) => a.end - b.end,
			compareStarts: (a: Interval, b: Interval) => a.start - b.start,
			create: createInterval,
		};
		startpointInRangeIndex = createStartpointInRangeIndex(helpers, undefined as any as Client);
		// sort the query result by the interval startpoint value
		compareFn = (a: Interval, b: Interval) => {
			if (a.start === b.start) {
				return a.end - b.end;
			}
			return a.start - b.start;
		};
	});

	it("return empty result when the index is empty", () => {
		results = startpointInRangeIndex.findIntervalsWithStartpointInRange(1, 1);
		assert.equal(results.length, 0, "Should not return anything once the index is empty");
	});

	it("limit on the start/end value", () => {
		startpointInRangeIndex.add(createTestInterval(1, 1));
		startpointInRangeIndex.add(createTestInterval(3, 4));
		results = startpointInRangeIndex.findIntervalsWithStartpointInRange(2, 1);
		assert.equal(results.length, 0, "The start value should not be lower than the end value");
		results = startpointInRangeIndex.findIntervalsWithStartpointInRange(0, 1);
		assert.equal(results.length, 0, "The start value should be larger than 0");

		results = startpointInRangeIndex.findIntervalsWithStartpointInRange(-2, -1);
		assert.equal(results.length, 0, "The endpoint value should not be negative");
	});

	it("can find correct results after adding multiple intervals", () => {
		startpointInRangeIndex.add(createTestInterval(1, 1));
		startpointInRangeIndex.add(createTestInterval(3, 4));
		results = startpointInRangeIndex.findIntervalsWithStartpointInRange(1, 1);
		assertPlainNumberIntervals(results, [{ start: 1, end: 1 }]);
		results = startpointInRangeIndex.findIntervalsWithStartpointInRange(1, 3);
		assertPlainNumberIntervals(results, [
			{ start: 1, end: 1 },
			{ start: 3, end: 4 },
		]);

		startpointInRangeIndex.add(createTestInterval(2, 4));
		startpointInRangeIndex.add(createTestInterval(4, 5));
		results = startpointInRangeIndex.findIntervalsWithStartpointInRange(1, 4);
		results.sort(compareFn);
		assertPlainNumberIntervals(results, [
			{ start: 1, end: 1 },
			{ start: 2, end: 4 },
			{ start: 3, end: 4 },
			{ start: 4, end: 5 },
		]);
	});

	it("can find correct results after removing multiple intervals", () => {
		const interval1 = createTestInterval(1, 1);
		const interval2 = createTestInterval(3, 4);
		startpointInRangeIndex.add(interval1);
		startpointInRangeIndex.add(interval2);
		startpointInRangeIndex.remove(interval1);

		results = startpointInRangeIndex.findIntervalsWithStartpointInRange(1, 2);
		assert.equal(results.length, 0);

		const interval3 = createTestInterval(4, 5);
		startpointInRangeIndex.add(interval3);
		startpointInRangeIndex.remove(interval2);

		results = startpointInRangeIndex.findIntervalsWithStartpointInRange(3, 5);
		assertPlainNumberIntervals(results, [{ start: 4, end: 5 }]);
	});

	it("compare with simple query method using random inputs", () => {
		const testIndex = new TestStartpointInRangeIndex();

		// Generate intervals randomly and add them to both index
		const intervals = generateRandomIntervals(10, 1, 20);
		for (const interval of intervals) {
			testIndex.add(interval);
			startpointInRangeIndex.add(interval);
		}

		for (let i = 0; i < 10; ++i) {
			const start = getRandomNumber(1, 20);
			const end = getRandomNumber(start, 20);
			// Query intervals using both index
			results = startpointInRangeIndex.findIntervalsWithStartpointInRange(start, end);
			const expected = testIndex.findIntervalsWithStartpointInRange(start, end);
			results.sort(compareFn);
			expected.sort(compareFn);

			assertPlainNumberIntervals(results, expected);
		}
	});
});
