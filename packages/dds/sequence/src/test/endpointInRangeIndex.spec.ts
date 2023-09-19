/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import {
	Client,
	ISegment,
	ReferenceType,
	compareReferencePositions,
} from "@fluidframework/merge-tree";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import {
	IEndpointInRangeIndex,
	createEndpointInRangeIndex,
	EndpointInRangeIndex,
} from "../intervalIndex";
import {
	Interval,
	IntervalType,
	SequenceInterval,
	createPositionReferenceFromSegoff,
	intervalHelpers,
} from "../intervals";
import { SharedString } from "../sharedString";
import { SharedStringFactory } from "../sequenceFactory";
import {
	RandomIntervalOptions,
	assertPlainNumberIntervals,
	createTestInterval,
	generateRandomIntervals,
} from "./intervalIndexUtils";
import { assertSequenceIntervalsEqual } from "./intervalEquivalenceUtils";

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

/**
 * Provides a naive way to query intervals given the range of interval endpoints
 */
class TestEndpointInRangeSequenceIntervalIndex implements IEndpointInRangeIndex<SequenceInterval> {
	private readonly intervals: SequenceInterval[];

	constructor(private readonly client: Client) {
		this.intervals = [];
	}

	add(interval: SequenceInterval) {
		this.intervals.push(interval);
	}

	remove(interval: SequenceInterval) {
		const index = this.intervals.findIndex((i) => i === interval);
		if (index !== -1) {
			this.intervals.splice(index, 1);
		}
	}

	findIntervalsWithEndpointInRange(
		startSegOff: { segment: ISegment | undefined; offset: number | undefined },
		endSegOff: { segment: ISegment | undefined; offset: number | undefined },
	) {
		const startLref = createPositionReferenceFromSegoff(
			this.client,
			startSegOff,
			ReferenceType.Transient,
		);

		const endLref = createPositionReferenceFromSegoff(
			this.client,
			endSegOff,
			ReferenceType.Transient,
		);

		return this.intervals.filter(
			(interval) =>
				compareReferencePositions(interval.end, startLref) >= 0 &&
				compareReferencePositions(interval.end, endLref) <= 0,
		);
	}
}

describe("findIntervalsWithEndpointInRange", () => {
	const helpers = intervalHelpers;
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
		endpointInRangeIndex = new EndpointInRangeIndex(undefined as any as Client, helpers);
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

describe("findIntervalsWithEndpointInRange for sharedstring and sequence intervals", () => {
	// Simulate real-world consumers' behavior
	let testSharedString: SharedString;
	let dataStoreRuntime: MockFluidDataStoreRuntime;
	let endpointInRangeIndex: IEndpointInRangeIndex<SequenceInterval>;
	let collection;
	let results;

	// sort the query results by the local reference position of interval endpoints
	const compareFn = (a: SequenceInterval, b: SequenceInterval) => {
		if (compareReferencePositions(a.start, b.start) !== 0) {
			return compareReferencePositions(a.start, b.start);
		}
		return compareReferencePositions(a.end, b.end);
	};

	const queryIntervalsByPositions = (start: number, end: number): Iterable<SequenceInterval> => {
		const startSegOff = testSharedString.getContainingSegment(start);
		const endSegOff = testSharedString.getContainingSegment(end);

		const intervals = endpointInRangeIndex.findIntervalsWithEndpointInRange(
			startSegOff,
			endSegOff,
		);
		intervals.sort(compareFn);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return intervals;
	};

	beforeEach(() => {
		dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: "1" });
		dataStoreRuntime.options = { intervalStickinessEnabled: true };
		testSharedString = new SharedString(
			dataStoreRuntime,
			"test-shared-string",
			SharedStringFactory.Attributes,
		);
		endpointInRangeIndex = createEndpointInRangeIndex(testSharedString);

		testSharedString.initializeLocal();
		collection = testSharedString.getIntervalCollection("test");
		collection.attachIndex(endpointInRangeIndex);
	});

	describe("find no intervals", () => {
		beforeEach(() => {
			testSharedString.insertText(0, "ab");
			testSharedString.insertText(2, "cde");
			testSharedString.insertText(5, "fg");
		});

		it("when the index is empty", () => {
			results = queryIntervalsByPositions(0, 2);
			assert.equal(results.length, 0);
		});

		it("when all intervals in index are above the query range", () => {
			collection.add(5, 6, IntervalType.SlideOnRemove);
			results = queryIntervalsByPositions(0, 2);
			assert.equal(results.length, 0);
		});

		it("when all intervals in index are below the query range", () => {
			collection.add(1, 1, IntervalType.SlideOnRemove);
			results = queryIntervalsByPositions(2, 5);
			assert.equal(results.length, 0);
		});

		it("when startSegment occurs `after` the endSegment", () => {
			collection.add(1, 1, IntervalType.SlideOnRemove);
			results = queryIntervalsByPositions(2, 0);
			assert.equal(results.length, 0);
		});

		it("when the segments are the same but startOffset occurs `after` the endOffset", () => {
			collection.add(1, 1, IntervalType.SlideOnRemove);
			results = queryIntervalsByPositions(1, 0);
			assert.equal(results.length, 0);
		});

		it("when the endSegment does not exist (out of bound)", () => {
			collection.add(1, 1, IntervalType.SlideOnRemove);
			results = queryIntervalsByPositions(1, 1000);
			assert.equal(results.length, 0);
		});
	});

	describe("find correct results", () => {
		let interval1;
		let interval2;
		let interval3;

		beforeEach(() => {
			testSharedString.insertText(0, "ab");
			testSharedString.insertText(2, "cde");
			testSharedString.insertText(5, "fg");
			interval1 = collection.add(1, 1, IntervalType.SlideOnRemove).getIntervalId();
			interval2 = collection.add(2, 3, IntervalType.SlideOnRemove).getIntervalId();
			interval3 = collection.add(5, 6, IntervalType.SlideOnRemove).getIntervalId();
		});

		it("when each interval is within a single segment", () => {
			results = queryIntervalsByPositions(0, 1);
			assertSequenceIntervalsEqual(testSharedString, results, [{ start: 1, end: 1 }]);

			results = queryIntervalsByPositions(1, 1);
			assertSequenceIntervalsEqual(testSharedString, results, [{ start: 1, end: 1 }]);

			results = queryIntervalsByPositions(1, 3);
			assertSequenceIntervalsEqual(testSharedString, results, [
				{ start: 1, end: 1 },
				{ start: 2, end: 3 },
			]);

			results = queryIntervalsByPositions(2, 4);
			assertSequenceIntervalsEqual(testSharedString, results, [{ start: 2, end: 3 }]);

			results = queryIntervalsByPositions(5, 6);
			assertSequenceIntervalsEqual(testSharedString, results, [{ start: 5, end: 6 }]);

			results = queryIntervalsByPositions(1, 6);
			assertSequenceIntervalsEqual(testSharedString, results, [
				{ start: 1, end: 1 },
				{ start: 2, end: 3 },
				{ start: 5, end: 6 },
			]);
		});

		it("when existing interval across multiple segments", () => {
			// Add intervals which are across more than one segments
			collection.add(1, 3, IntervalType.SlideOnRemove);
			collection.add(2, 5, IntervalType.SlideOnRemove);
			collection.add(4, 6, IntervalType.SlideOnRemove);
			collection.add(1, 6, IntervalType.SlideOnRemove);

			results = queryIntervalsByPositions(0, 1);
			assertSequenceIntervalsEqual(testSharedString, results, [{ start: 1, end: 1 }]);

			results = queryIntervalsByPositions(1, 3);
			assertSequenceIntervalsEqual(testSharedString, results, [
				{ start: 1, end: 1 },
				{ start: 1, end: 3 },
				{ start: 2, end: 3 },
			]);

			results = queryIntervalsByPositions(5, 5);
			assertSequenceIntervalsEqual(testSharedString, results, [{ start: 2, end: 5 }]);

			results = queryIntervalsByPositions(5, 6);
			assertSequenceIntervalsEqual(testSharedString, results, [
				{ start: 1, end: 6 },
				{ start: 2, end: 5 },
				{ start: 4, end: 6 },
				{ start: 5, end: 6 },
			]);
		});

		it("when adding duplicate intervals to the index", () => {
			collection.add(1, 1, IntervalType.SlideOnRemove);
			collection.add(2, 3, IntervalType.SlideOnRemove);
			collection.add(1, 1, IntervalType.SlideOnRemove);

			results = queryIntervalsByPositions(1, 3);
			assertSequenceIntervalsEqual(testSharedString, results, [
				{ start: 1, end: 1 },
				{ start: 1, end: 1 },
				{ start: 1, end: 1 },
				{ start: 2, end: 3 },
				{ start: 2, end: 3 },
			]);

			results = queryIntervalsByPositions(1, 6);
			assertSequenceIntervalsEqual(testSharedString, results, [
				{ start: 1, end: 1 },
				{ start: 1, end: 1 },
				{ start: 1, end: 1 },
				{ start: 2, end: 3 },
				{ start: 2, end: 3 },
				{ start: 5, end: 6 },
			]);
		});

		it("when removing intervals from the index", () => {
			collection.removeIntervalById(interval2);
			results = queryIntervalsByPositions(1, 6);
			assertSequenceIntervalsEqual(testSharedString, results, [
				{ start: 1, end: 1 },
				{ start: 5, end: 6 },
			]);

			// Add and remove duplicate intervals
			const interval4 = collection.add(1, 1, IntervalType.SlideOnRemove).getIntervalId();
			collection.removeIntervalById(interval1);
			results = queryIntervalsByPositions(1, 6);
			assertSequenceIntervalsEqual(testSharedString, results, [
				{ start: 1, end: 1 },
				{ start: 5, end: 6 },
			]);

			collection.removeIntervalById(interval4);
			results = queryIntervalsByPositions(1, 6);
			assertSequenceIntervalsEqual(testSharedString, results, [{ start: 5, end: 6 }]);
		});
	});

	describe("achieve eventual consistency through random operations", () => {
		/**
		 * Fills in random sequence intervals to the index and interval collection
		 * @param options - The options object containing random, count, and min properties.
		 */
		const fillInRandomSequenceIntervals = ({
			random,
			count,
			min,
		}: Pick<RandomIntervalOptions, "random" | "count" | "min">): void => {
			// Generate random text, and insert them into random positions of the string
			for (let i = 0; i < count / 2; ++i) {
				testSharedString.insertText(
					random.integer(0, Math.max(testSharedString.getLength() - 1, 0)),
					random.string(random.bool() ? 2 : 1),
				);
			}
			const max = testSharedString.getLength() - 1;
			// Genereate random sequence intervals
			for (let i = 0; i < count; ++i) {
				const start = random.integer(min, max);
				const end = random.integer(start, max);
				collection.add(start, end, IntervalType.SlideOnRemove);
			}
		};

		it("when given massive random inputs", () => {
			const testEndpointInRangeIndex = new TestEndpointInRangeSequenceIntervalIndex(
				(testSharedString as unknown as { client: Client }).client,
			);
			collection.attachIndex(testEndpointInRangeIndex);

			const random = makeRandom(0);
			const count = 100;
			const min = 0;

			fillInRandomSequenceIntervals({ random, count, min });
			// Test with running 100 random queries
			const max = testSharedString.getLength() - 1;
			for (let i = 0; i < 100; ++i) {
				const start = random.integer(min, max);
				const end = random.integer(start, max);
				// Query intervals using two distinct methods
				results = queryIntervalsByPositions(start, end);
				const startSegOff = testSharedString.getContainingSegment(start);
				const endSegOff = testSharedString.getContainingSegment(end);
				const expected = testEndpointInRangeIndex.findIntervalsWithEndpointInRange(
					startSegOff,
					endSegOff,
				);
				// results.sort(compareFn);
				expected.sort(compareFn);

				assertSequenceIntervalsEqual(testSharedString, results, expected);
			}
		});
	});
});
