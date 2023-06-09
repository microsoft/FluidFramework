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
	createEndpointInRangeIndex,
	createInterval,
} from "../intervalCollection";

const reservedIntervalIdKey = "intervalId";

class TestEndpointInRangeIndex {
	private readonly intervals: Interval[];

	constructor() {
		this.intervals = [];
	}

	add(interval: Interval) {
		this.intervals.push(interval);
	}

	findIntervalsWithEndpointInRange(start: number, end: number): Interval[] {
		return this.intervals.filter((interval) => interval.end >= start && interval.end <= end);
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

describe("Support querying intervals with endpoints in a specified range", () => {
	let helpers: IIntervalHelpers<Interval>;
	let endpointInRangeIndex;
	let compareFn;
	let results;

	beforeEach(() => {
		helpers = {
			compareEnds: (a: Interval, b: Interval) => a.end - b.end,
			create: createInterval,
		};
		endpointInRangeIndex = createEndpointInRangeIndex(helpers, undefined as any as Client);
		// sort the query result by the interval endpoint value
		compareFn = (a: Interval, b: Interval) => {
			if (a.end === b.end) {
				return a.start - b.start;
			}
			return a.end - b.end;
		};
	});

	it("return empty result when the index is empty", () => {
		results = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 1);
		assert.equal(results.length, 0, "Should not return anything once the index is empty");
	});

	it("limit on the start/end value", () => {
		endpointInRangeIndex.add(createTestInterval(1, 1));
		endpointInRangeIndex.add(createTestInterval(1, 3));

		results = endpointInRangeIndex.findIntervalsWithEndpointInRange(2, 1);
		assert.equal(results.length, 0, "The start value should not be lower than the end value");

		results = endpointInRangeIndex.findIntervalsWithEndpointInRange(0, 1);
		assert.equal(results.length, 0, "The start value should be larger than 0");

		results = endpointInRangeIndex.findIntervalsWithEndpointInRange(-2, -1);
		assert.equal(results.length, 0, "The endpoint value should not be negative");
	});

	it("can find correct results after adding multiple intervals", () => {
		endpointInRangeIndex.add(createTestInterval(1, 1));
		endpointInRangeIndex.add(createTestInterval(1, 3));

		results = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 1);
		assertPlainNumberIntervals(results, [{ start: 1, end: 1 }]);

		results = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 3);
		assertPlainNumberIntervals(results, [
			{ start: 1, end: 1 },
			{ start: 1, end: 3 },
		]);

		endpointInRangeIndex.add(createTestInterval(2, 4));
		endpointInRangeIndex.add(createTestInterval(3, 5));
		endpointInRangeIndex.add(createTestInterval(3, 4));
		results = endpointInRangeIndex.findIntervalsWithEndpointInRange(3, 5);
		results.sort(compareFn);
		assertPlainNumberIntervals(results, [
			{ start: 1, end: 3 },
			{ start: 2, end: 4 },
			{ start: 3, end: 4 },
			{ start: 3, end: 5 },
		]);
	});

	it("can find correct results after removing multiple intervals", () => {
		const interval1 = createTestInterval(1, 1);
		const interval2 = createTestInterval(1, 3);
		endpointInRangeIndex.add(interval1);
		endpointInRangeIndex.add(interval2);
		endpointInRangeIndex.remove(interval1);

		results = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 2);
		assert.equal(results.length, 0);

		const interval3 = createTestInterval(2, 4);
		endpointInRangeIndex.add(interval3);
		endpointInRangeIndex.remove(interval2);

		results = endpointInRangeIndex.findIntervalsWithEndpointInRange(3, 5);
		assertPlainNumberIntervals(results, [{ start: 2, end: 4 }]);
	});

	it("compare with simple query method using random inputs", () => {
		const testIndex = new TestEndpointInRangeIndex();

		// Generate intervals randomly and add them to both index
		const intervals = generateRandomIntervals(10, 1, 20);
		for (const interval of intervals) {
			testIndex.add(interval);
			endpointInRangeIndex.add(interval);
		}

		for (let i = 0; i < 10; ++i) {
			const start = getRandomNumber(1, 20);
			const end = getRandomNumber(start, 20);
			// Query intervals using both index
			results = endpointInRangeIndex.findIntervalsWithEndpointInRange(start, end);
			const expected = testIndex.findIntervalsWithEndpointInRange(start, end);
			results.sort(compareFn);
			expected.sort(compareFn);

			assertPlainNumberIntervals(results, expected);
		}
	});
});
