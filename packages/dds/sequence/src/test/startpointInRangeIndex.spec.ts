/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { makeRandom } from "@fluid-private/stochastic-test-utils";
import { Client } from "@fluidframework/merge-tree/internal";

import { IStartpointInRangeIndex, StartpointInRangeIndex } from "../intervalIndex/index.js";

import {
	assertPlainNumberIntervals,
	createTestInterval,
	generateRandomIntervals,
	type Interval,
} from "./intervalIndexTestUtils.js";

class TestStartpointInRangeIndex implements IStartpointInRangeIndex<Interval> {
	private readonly intervals: Interval[];

	constructor() {
		this.intervals = [];
	}

	add(interval: Interval) {
		this.intervals.push(interval);
	}

	remove(interval: Interval) {
		const index = this.intervals.findIndex((i) => i === interval);
		if (index !== -1) {
			this.intervals.splice(index, 1);
		}
	}

	findIntervalsWithStartpointInRange(start: number, end: number): Interval[] {
		return this.intervals.filter(
			(interval) => interval.start >= start && interval.start <= end,
		);
	}
}

describe("findIntervalsWithStartpointInRange", () => {
	// sort the query result by the interval startpoint value
	const compareFn = (a: Interval, b: Interval) => {
		if (a.start === b.start) {
			return a.end - b.end;
		}
		return a.start - b.start;
	};
	let startpointInRangeIndex;
	let results;

	beforeEach(() => {
		startpointInRangeIndex = new StartpointInRangeIndex(undefined as any as Client);
	});

	describe("finds no intervals", () => {
		it("when the index is empty", () => {
			results = startpointInRangeIndex.findIntervalsWithStartpointInRange(1, 1);
			assert.equal(results.length, 0);
		});

		describe("with intervals in the index", () => {
			beforeEach(() => {
				startpointInRangeIndex.add(createTestInterval(2, 2));
				startpointInRangeIndex.add(createTestInterval(3, 4));
			});

			it("when start > end for the query range", () => {
				results = startpointInRangeIndex.findIntervalsWithStartpointInRange(2, 1);
				assert.equal(results.length, 0);
			});

			it("when start is 0 for the query range", () => {
				results = startpointInRangeIndex.findIntervalsWithStartpointInRange(0, 2);
				assert.equal(results.length, 0);
			});

			it("when endpoints of the query range are negative", () => {
				results = startpointInRangeIndex.findIntervalsWithStartpointInRange(-2, -1);
				assert.equal(results.length, 0);
				results = startpointInRangeIndex.findIntervalsWithStartpointInRange(-1, 1);
				assert.equal(results.length, 0);
			});

			it("when all intervals are above the query range", () => {
				results = startpointInRangeIndex.findIntervalsWithStartpointInRange(1, 1);
				assert.equal(results.length, 0);
			});

			it("when all intervals are below the query range", () => {
				results = startpointInRangeIndex.findIntervalsWithStartpointInRange(5, 6);
				assert.equal(results.length, 0);
			});
		});
	});

	describe("finds intervals while performing multiple adding operations on the index", () => {
		beforeEach(() => {
			startpointInRangeIndex.add(createTestInterval(1, 3));
			startpointInRangeIndex.add(createTestInterval(2, 3));
		});

		it("when quering the intervals which the startpoints exactly fall on the range boundary", () => {
			results = startpointInRangeIndex.findIntervalsWithStartpointInRange(1, 1);
			assertPlainNumberIntervals(results, [{ start: 1, end: 3 }]);
			results = startpointInRangeIndex.findIntervalsWithStartpointInRange(1, 2);
			assertPlainNumberIntervals(results, [
				{ start: 1, end: 3 },
				{ start: 2, end: 3 },
			]);
		});

		it("when querying various kinds of intervals within the range", () => {
			startpointInRangeIndex.add(createTestInterval(2, 4));
			startpointInRangeIndex.add(createTestInterval(3, 4));
			startpointInRangeIndex.add(createTestInterval(4, 5));
			startpointInRangeIndex.add(createTestInterval(3, 4)); // duplicate interval

			results = startpointInRangeIndex.findIntervalsWithStartpointInRange(2, 4);
			results.sort(compareFn);
			assertPlainNumberIntervals(results, [
				{ start: 2, end: 3 },
				{ start: 2, end: 4 },
				{ start: 3, end: 4 },
				{ start: 3, end: 4 },
				{ start: 4, end: 5 },
			]);
		});
	});

	describe("find intervals while performing removing operations on the index", () => {
		let interval1;
		let interval2;

		beforeEach(() => {
			interval1 = createTestInterval(1, 3);
			interval2 = createTestInterval(2, 3);
			startpointInRangeIndex.add(interval1);
			startpointInRangeIndex.add(interval2);
		});

		it("when removing the interval with duplicate startpoints/endpoints", () => {
			const interval3 = createTestInterval(1, 3);
			startpointInRangeIndex.add(interval3);
			startpointInRangeIndex.remove(interval1);

			results = startpointInRangeIndex.findIntervalsWithStartpointInRange(1, 2);
			results.sort(compareFn);
			assertPlainNumberIntervals(results, [
				{ start: 1, end: 3 },
				{ start: 2, end: 3 },
			]);

			startpointInRangeIndex.remove(interval3);
			results = startpointInRangeIndex.findIntervalsWithStartpointInRange(1, 2);
			assertPlainNumberIntervals(results, [{ start: 2, end: 3 }]);
		});

		it("when removing the interval does not exist in the index", () => {
			const interval3 = createTestInterval(1, 3);
			startpointInRangeIndex.remove(interval3);

			results = startpointInRangeIndex.findIntervalsWithStartpointInRange(1, 2);
			results.sort(compareFn);
			assertPlainNumberIntervals(results, [
				{ start: 1, end: 3 },
				{ start: 2, end: 3 },
			]);
		});

		it("when removing the interval within the target range", () => {
			startpointInRangeIndex.remove(interval2);

			results = startpointInRangeIndex.findIntervalsWithStartpointInRange(1, 2);
			assertPlainNumberIntervals(results, [{ start: 1, end: 3 }]);

			const interval3 = createTestInterval(2, 4);
			startpointInRangeIndex.add(interval3);

			const interval4 = createTestInterval(3, 4);
			startpointInRangeIndex.add(interval4);

			startpointInRangeIndex.remove(interval3);

			results = startpointInRangeIndex.findIntervalsWithStartpointInRange(1, 4);
			results.sort(compareFn);
			assertPlainNumberIntervals(results, [
				{ start: 1, end: 3 },
				{ start: 3, end: 4 },
			]);
		});
	});

	describe("find exactly the same intervals as those obtained by `brute-force` method", () => {
		it("when given massive random inputs", () => {
			const testIndex = new TestStartpointInRangeIndex();
			const random = makeRandom(0);
			const count = 800;
			const min = 1;
			const max = 1500;

			// Generate intervals randomly and add them to both index
			const intervals = generateRandomIntervals({ random, count, min, max });
			for (const interval of intervals) {
				testIndex.add(interval);
				startpointInRangeIndex.add(interval);
			}

			// Test with running 1000 random queries
			for (let i = 0; i < 1000; ++i) {
				const start = random.integer(min, max);
				const end = random.integer(start, max);
				// Query intervals using both index
				results = startpointInRangeIndex.findIntervalsWithStartpointInRange(start, end);
				const expected = testIndex.findIntervalsWithStartpointInRange(start, end);
				results.sort(compareFn);
				expected.sort(compareFn);

				assertPlainNumberIntervals(results, expected);
			}
		});
	});
});
