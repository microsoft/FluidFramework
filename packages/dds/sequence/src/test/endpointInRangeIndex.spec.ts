/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import { makeRandom } from "@fluid-private/stochastic-test-utils";
import { Lazy } from "@fluidframework/core-utils/internal";
import { TestClient } from "@fluidframework/merge-tree/internal/test";

import { EndpointInRangeIndex, IEndpointInRangeIndex } from "../intervalIndex/index.js";
import { type SequenceInterval } from "../intervals/index.js";

import {
	assertOrderedSequenceIntervals,
	createTestSequenceInterval,
	generateRandomIntervals,
} from "./intervalIndexTestUtils.js";

class TestEndpointInRangeIndex implements IEndpointInRangeIndex<SequenceInterval> {
	private readonly intervals: {
		start: Lazy<number>;
		end: Lazy<number>;
		interval: SequenceInterval;
	}[];

	constructor(private readonly client: TestClient) {
		this.intervals = [];
	}

	add(interval: SequenceInterval) {
		this.intervals.push({
			start: new Lazy(() => this.client.localReferencePositionToPosition(interval.start)),
			end: new Lazy(() => this.client.localReferencePositionToPosition(interval.end)),
			interval,
		});
	}

	remove(interval: SequenceInterval) {
		const index = this.intervals.findIndex((i) => i.interval === interval);
		if (index !== -1) {
			this.intervals.splice(index, 1);
		}
	}

	findIntervalsWithEndpointInRange(start: number, end: number): SequenceInterval[] {
		return this.intervals
			.filter((interval) => interval.end.value >= start && interval.end.value <= end)
			.map((i) => i.interval);
	}
}

describe("findIntervalsWithEndpointInRange", () => {
	// sort the query result by the interval endpoint value
	const compareFn = (a: SequenceInterval, b: SequenceInterval) => {
		const aEnd = client.localReferencePositionToPosition(a.end);
		const bEnd = client.localReferencePositionToPosition(b.end);
		const aStart = client.localReferencePositionToPosition(a.start);
		const bStart = client.localReferencePositionToPosition(b.start);
		if (aEnd === bEnd) {
			if (aStart === aStart) {
				return a.getIntervalId().localeCompare(b.getIntervalId());
			}
			return aStart - bStart;
		}
		return aEnd - bEnd;
	};
	let endpointInRangeIndex: EndpointInRangeIndex;
	let createTestInterval: (p1, p2) => SequenceInterval;
	let client: TestClient;

	beforeEach(() => {
		client = new TestClient();
		Array.from({ length: 100 }).forEach(() => client.insertTextLocal(0, "0123456789"));
		endpointInRangeIndex = new EndpointInRangeIndex(client);
		createTestInterval = (p1, p2) => createTestSequenceInterval(client, p1, p2);
	});

	describe("finds no intervals", () => {
		it("when the index is empty", () => {
			const results = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 1);
			assert.equal(results.length, 0);
		});

		describe("with intervals in the index", () => {
			beforeEach(() => {
				endpointInRangeIndex.add(createTestInterval(1, 2));
				endpointInRangeIndex.add(createTestInterval(2, 3));
			});

			it("when start > end for the query range", () => {
				const results = endpointInRangeIndex.findIntervalsWithEndpointInRange(2, 1);
				assert.equal(results.length, 0);
			});

			it("when start is 0 for the query range", () => {
				const results = endpointInRangeIndex.findIntervalsWithEndpointInRange(0, 1);
				assert.equal(results.length, 0);
			});

			it("when endpoint(s) of the query range are negative", () => {
				const results = endpointInRangeIndex.findIntervalsWithEndpointInRange(-2, -1);
				assert.equal(results.length, 0);
				const results2 = endpointInRangeIndex.findIntervalsWithEndpointInRange(-1, 1);
				assert.equal(results2.length, 0);
			});

			it("when all intervals are above the query range", () => {
				const results = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 1);
				assert.equal(results.length, 0);
			});

			it("when all intervals are below the query range", () => {
				const results = endpointInRangeIndex.findIntervalsWithEndpointInRange(4, 5);
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
			const results = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 1);
			assertOrderedSequenceIntervals(client, results, [{ start: 1, end: 1 }]);

			const results2 = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 3);
			assertOrderedSequenceIntervals(client, results2, [
				{ start: 1, end: 1 },
				{ start: 1, end: 3 },
			]);
		});

		it("when querying various kinds of intervals within the range", () => {
			endpointInRangeIndex.add(createTestInterval(2, 4));
			endpointInRangeIndex.add(createTestInterval(3, 5));
			endpointInRangeIndex.add(createTestInterval(3, 4));
			endpointInRangeIndex.add(createTestInterval(3, 4)); // duplicate interval

			const results = endpointInRangeIndex.findIntervalsWithEndpointInRange(3, 6);
			results.sort(compareFn);
			assertOrderedSequenceIntervals(client, results, [
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

			const results = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 3);
			results.sort(compareFn);
			assertOrderedSequenceIntervals(client, results, [
				{ start: 1, end: 1 },
				{ start: 1, end: 3 },
			]);

			endpointInRangeIndex.remove(interval3);
			const results2 = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 3);
			assertOrderedSequenceIntervals(client, results2, [{ start: 1, end: 3 }]);
		});

		it("when removing the interval does not exist in the index", () => {
			const interval3 = createTestInterval(1, 1);
			endpointInRangeIndex.remove(interval3);

			const results = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 3);
			results.sort(compareFn);
			assertOrderedSequenceIntervals(client, results, [
				{ start: 1, end: 1 },
				{ start: 1, end: 3 },
			]);
		});

		it("when removing the interval within the target range", () => {
			endpointInRangeIndex.remove(interval2);

			const results = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 3);
			assertOrderedSequenceIntervals(client, results, [{ start: 1, end: 1 }]);

			const interval3 = createTestInterval(2, 4);
			endpointInRangeIndex.add(interval3);

			const interval4 = createTestInterval(3, 4);
			endpointInRangeIndex.add(interval4);

			endpointInRangeIndex.remove(interval3);

			const results2 = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 5);
			results.sort(compareFn);
			assertOrderedSequenceIntervals(client, results2, [
				{ start: 1, end: 1 },
				{ start: 3, end: 4 },
			]);
		});
	});

	describe("find exactly the same intervals as those obtained by `brute-force` method", () => {
		it("when given massive random inputs", () => {
			const testIndex = new TestEndpointInRangeIndex(client);
			const random = makeRandom(0);
			const count = 800;
			const min = 1;
			const max = client.getLength() - 1;

			// Generate intervals randomly and add them to both index
			const intervals = generateRandomIntervals(client, { random, count, min, max });
			for (const interval of intervals) {
				testIndex.add(interval);
				endpointInRangeIndex.add(interval);
			}

			// Test with running 100 random queries
			for (let i = 0; i < 100; ++i) {
				const start = random.integer(min, max);
				const end = random.integer(start, max);
				// Query intervals using both index
				const results = endpointInRangeIndex.findIntervalsWithEndpointInRange(start, end);
				const expected = testIndex.findIntervalsWithEndpointInRange(start, end);
				results.sort(compareFn);
				expected.sort(compareFn);

				assertOrderedSequenceIntervals(client, results, expected);
			}
		});
	});
});
