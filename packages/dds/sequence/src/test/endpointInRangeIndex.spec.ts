/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { makeRandom } from "@fluid-private/stochastic-test-utils";
import { Client } from "@fluidframework/merge-tree/internal";

import { EndpointInRangeIndex, IEndpointInRangeIndex } from "../intervalIndex/index.js";

import {
	assertPlainNumberIntervals,
	createTestInterval,
	generateRandomIntervals,
	type Interval,
} from "./intervalIndexTestUtils.js";

class TestEndpointInRangeIndex implements IEndpointInRangeIndex<Interval> {
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

	findIntervalsWithEndpointInRange(start: number, end: number): Interval[] {
		return this.intervals.filter((interval) => interval.end >= start && interval.end <= end);
	}
}

describe("findIntervalsWithEndpointInRange", () => {
	// sort the query result by the interval endpoint value
	const compareFn = (a: Interval, b: Interval) => {
		if (a.end === b.end) {
			return a.start - b.start;
		}
		return a.end - b.end;
	};
	let endpointInRangeIndex;
	let results;

	beforeEach(() => {
		endpointInRangeIndex = new EndpointInRangeIndex(undefined as any as Client);
	});

	describe("finds no intervals", () => {
		it("when the index is empty", () => {
			results = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 1);
			assert.equal(results.length, 0);
		});

		describe("with intervals in the index", () => {
			beforeEach(() => {
				endpointInRangeIndex.add(createTestInterval(1, 2));
				endpointInRangeIndex.add(createTestInterval(2, 3));
			});

			it("when start > end for the query range", () => {
				results = endpointInRangeIndex.findIntervalsWithEndpointInRange(2, 1);
				assert.equal(results.length, 0);
			});

			it("when start is 0 for the query range", () => {
				results = endpointInRangeIndex.findIntervalsWithEndpointInRange(0, 1);
				assert.equal(results.length, 0);
			});

			it("when endpoint(s) of the query range are negative", () => {
				results = endpointInRangeIndex.findIntervalsWithEndpointInRange(-2, -1);
				assert.equal(results.length, 0);
				results = endpointInRangeIndex.findIntervalsWithEndpointInRange(-1, 1);
				assert.equal(results.length, 0);
			});

			it("when all intervals are above the query range", () => {
				results = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 1);
				assert.equal(results.length, 0);
			});

			it("when all intervals are below the query range", () => {
				results = endpointInRangeIndex.findIntervalsWithEndpointInRange(4, 5);
				assert.equal(results.length, 0);
			});
		});
	});

	describe("finds intervals while performing multiple adding operations on the index", () => {
		beforeEach(() => {
			endpointInRangeIndex.add(createTestInterval(1, 1));
			endpointInRangeIndex.add(createTestInterval(1, 3));
		});

		it("when quering the intervals which the startpoints exactly fall on the range boundary", () => {
			results = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 1);
			assertPlainNumberIntervals(results, [{ start: 1, end: 1 }]);

			results = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 3);
			assertPlainNumberIntervals(results, [
				{ start: 1, end: 1 },
				{ start: 1, end: 3 },
			]);
		});

		it("when querying various kinds of intervals within the range", () => {
			endpointInRangeIndex.add(createTestInterval(2, 4));
			endpointInRangeIndex.add(createTestInterval(3, 5));
			endpointInRangeIndex.add(createTestInterval(3, 4));
			endpointInRangeIndex.add(createTestInterval(3, 4)); // duplicate interval

			results = endpointInRangeIndex.findIntervalsWithEndpointInRange(3, 6);
			results.sort(compareFn);
			assertPlainNumberIntervals(results, [
				{ start: 1, end: 3 },
				{ start: 2, end: 4 },
				{ start: 3, end: 4 },
				{ start: 3, end: 4 },
				{ start: 3, end: 5 },
			]);
		});
	});

	describe("find intervals while performing removing operations on the index", () => {
		let interval1;
		let interval2;

		beforeEach(() => {
			interval1 = createTestInterval(1, 1);
			interval2 = createTestInterval(1, 3);
			endpointInRangeIndex.add(interval1);
			endpointInRangeIndex.add(interval2);
		});

		it("when removing the interval with duplicate startpoints/endpoints", () => {
			const interval3 = createTestInterval(1, 1);
			endpointInRangeIndex.add(interval3);
			endpointInRangeIndex.remove(interval1);

			results = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 3);
			results.sort(compareFn);
			assertPlainNumberIntervals(results, [
				{ start: 1, end: 1 },
				{ start: 1, end: 3 },
			]);

			endpointInRangeIndex.remove(interval3);
			results = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 3);
			assertPlainNumberIntervals(results, [{ start: 1, end: 3 }]);
		});

		it("when removing the interval does not exist in the index", () => {
			const interval3 = createTestInterval(1, 1);
			endpointInRangeIndex.remove(interval3);

			results = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 3);
			results.sort(compareFn);
			assertPlainNumberIntervals(results, [
				{ start: 1, end: 1 },
				{ start: 1, end: 3 },
			]);
		});

		it("when removing the interval within the target range", () => {
			endpointInRangeIndex.remove(interval2);

			results = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 3);
			assertPlainNumberIntervals(results, [{ start: 1, end: 1 }]);

			const interval3 = createTestInterval(2, 4);
			endpointInRangeIndex.add(interval3);

			const interval4 = createTestInterval(3, 4);
			endpointInRangeIndex.add(interval4);

			endpointInRangeIndex.remove(interval3);

			results = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 5);
			results.sort(compareFn);
			assertPlainNumberIntervals(results, [
				{ start: 1, end: 1 },
				{ start: 3, end: 4 },
			]);
		});
	});

	describe("find exactly the same intervals as those obtained by `brute-force` method", () => {
		it("when given massive random inputs", () => {
			const testIndex = new TestEndpointInRangeIndex();
			const random = makeRandom(0);
			const count = 800;
			const min = 1;
			const max = 1500;

			// Generate intervals randomly and add them to both index
			const intervals = generateRandomIntervals({ random, count, min, max });
			for (const interval of intervals) {
				testIndex.add(interval);
				endpointInRangeIndex.add(interval);
			}

			// Test with running 1000 random queries
			for (let i = 0; i < 1000; ++i) {
				const start = random.integer(min, max);
				const end = random.integer(start, max);
				// Query intervals using both index
				results = endpointInRangeIndex.findIntervalsWithEndpointInRange(start, end);
				const expected = testIndex.findIntervalsWithEndpointInRange(start, end);
				results.sort(compareFn);
				expected.sort(compareFn);

				assertPlainNumberIntervals(results, expected);
			}
		});
	});
});
