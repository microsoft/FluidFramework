/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable jsdoc/check-indentation */

import { strict as assert } from "assert";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { LocalReferencePosition, compareReferencePositions } from "@fluidframework/merge-tree";
import { makeRandom } from "@fluid-internal/stochastic-test-utils";
import { IntervalType, SequenceInterval } from "../intervals";
import { SharedString } from "../sharedString";
import { SharedStringFactory } from "../sequenceFactory";
import { createOverlappingSequenceIntervalsIndex } from "../intervalIndex";
import { RandomIntervalOptions } from "./intervalIndexUtils";

class TestSharedString extends SharedString {
	// Expose the `client` to the public and keep other properties unchanged
	public client;
}

function assertSequenceIntervalsEqual(
	string: TestSharedString,
	results: SequenceInterval[],
	expected: { start: number; end: number }[] | SequenceInterval[],
): void {
	assert.equal(results.length, expected.length, "Mismatched result count");

	for (let i = 0; i < results.length; ++i) {
		assert(results[i]);
		const resultStart = string.localReferencePositionToPosition(results[i].start);
		const resultEnd = string.localReferencePositionToPosition(results[i].end);
		let expectedStart;
		let expectedEnd;

		if (expected[i] instanceof SequenceInterval) {
			expectedStart = string.localReferencePositionToPosition(
				expected[i].start as LocalReferencePosition,
			);
			expectedEnd = string.localReferencePositionToPosition(
				expected[i].end as LocalReferencePosition,
			);
		} else {
			expectedStart = expected[i].start;
			expectedEnd = expected[i].end;
		}

		assert.equal(resultStart, expectedStart, "mismatched start");
		assert.equal(resultEnd, expectedEnd, "mismatched end");
	}
}

describe("findOverlappingIntervalsBySegoff", () => {
	// sort the query results by the local reference position of interval endpoints
	const compareFn = (a: SequenceInterval, b: SequenceInterval) => {
		if (compareReferencePositions(a.start, b.start) !== 0) {
			return compareReferencePositions(a.start, b.start);
		}
		return compareReferencePositions(a.end, b.end);
	};
	let testSharedString: TestSharedString;
	let dataStoreRuntime: MockFluidDataStoreRuntime;
	let overlappingSequenceIntervalsIndex;
	let collection;
	let results;

	const queryIntervalsByPositions = (start: number, end: number): Iterable<SequenceInterval> => {
		const startSegOff = testSharedString.client.getContainingSegment(start);
		const endSegOff = testSharedString.client.getContainingSegment(end);

		const intervals = overlappingSequenceIntervalsIndex.findOverlappingIntervalsBySegoff(
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
		testSharedString = new TestSharedString(
			dataStoreRuntime,
			"test-shared-string",
			SharedStringFactory.Attributes,
		);
		overlappingSequenceIntervalsIndex = createOverlappingSequenceIntervalsIndex(
			testSharedString.client,
		);

		testSharedString.initializeLocal();
		collection = testSharedString.getIntervalCollection("test");
		collection.attachIndex(overlappingSequenceIntervalsIndex);
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
			collection.add(1, 6, IntervalType.SlideOnRemove);

			results = queryIntervalsByPositions(0, 1);
			assertSequenceIntervalsEqual(testSharedString, results, [
				{ start: 1, end: 1 },
				{ start: 1, end: 3 },
				{ start: 1, end: 6 },
			]);

			results = queryIntervalsByPositions(1, 3);
			assertSequenceIntervalsEqual(testSharedString, results, [
				{ start: 1, end: 1 },
				{ start: 1, end: 3 },
				{ start: 1, end: 6 },
				{ start: 2, end: 3 },
				{ start: 2, end: 5 },
			]);

			results = queryIntervalsByPositions(5, 5);
			assertSequenceIntervalsEqual(testSharedString, results, [
				{ start: 1, end: 6 },
				{ start: 2, end: 5 },
				{ start: 5, end: 6 },
			]);
		});

		it("when adding duplicate intervals to the index", () => {
			collection.add(1, 1, IntervalType.SlideOnRemove);
			collection.add(2, 3, IntervalType.SlideOnRemove);
			collection.add(1, 1, IntervalType.SlideOnRemove);

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

		it("when inserting or appending additional segments to the string", () => {
			// Append a segment to the end of the string
			testSharedString.insertText(7, "hijk");
			collection.add(7, 9, IntervalType.SlideOnRemove); // `interval4` in below graphs

			/**
			 * Visualization of intervals within the string after the last insertion:
			 *
			 *                  0 1 2 3 4 5 6 7 8 9 10
			 *                  a b c d e f g h i j k
			 *  interval1         ^
			 *  interval2           [-]
			 *  interval3                 [-]
			 *  interval4                     [---]
			 */

			results = queryIntervalsByPositions(5, 7);
			assertSequenceIntervalsEqual(testSharedString, results, [
				{ start: 5, end: 6 },
				{ start: 7, end: 9 },
			]);

			// Insert a segment in the middle of the string
			testSharedString.insertText(3, "xx");

			/**
			 * Visualization of intervals within the string after the last insertion:
			 *
			 * interval2's endpoint slides forwards
			 * interval3 and interval4 shift forwards
			 *
			 *                  0 1 2 3 4 5 6 7 8 9 10 11 12
			 *                  a b c x x d e f g h i  j  k
			 *  interval1         ^
			 *  interval2           [-----]
			 *  interval3                     [-]
			 *  interval4                         [----]
			 */

			results = queryIntervalsByPositions(2, 4);
			assertSequenceIntervalsEqual(testSharedString, results, [{ start: 2, end: 5 }]);
			results = queryIntervalsByPositions(5, 7);
			assertSequenceIntervalsEqual(testSharedString, results, [
				{ start: 2, end: 5 },
				{ start: 7, end: 8 },
			]);
			results = queryIntervalsByPositions(6, 9);
			assertSequenceIntervalsEqual(testSharedString, results, [
				{ start: 7, end: 8 },
				{ start: 9, end: 11 },
			]);

			// Insert a segment at the head of the string
			testSharedString.insertText(0, "yy");

			/**
			 * Visualization of intervals within the string after the last insertion:
			 * All intervals shift forwards
			 *
			 *                  0 1 2 3 4 5 6 7 8 9 10 11 12 13 14
			 *                  y y a b c x x d e f g  h  i  j  k
			 *  interval1             ^
			 *  interval2               [-----]
			 *  interval3                         [-]
			 *  interval4                              [-----]
			 */

			results = queryIntervalsByPositions(0, 14);
			assertSequenceIntervalsEqual(testSharedString, results, [
				{ start: 3, end: 3 },
				{ start: 4, end: 7 },
				{ start: 9, end: 10 },
				{ start: 11, end: 13 },
			]);
		});

		it("when removing segments from the string", () => {
			// Remove the middle part of the string
			testSharedString.removeText(2, 4);

			/**
			 * Visualization of intervals within the string after the last deletion:
			 *
			 * interval2's startpoint slides forwards but the remains in the original segment
			 * interval3 shifts forwards
			 *
			 *                  0 1 2 3 4
			 *                  a b e f g
			 *  interval1         ^
			 *  interval2           ^
			 *  interval3             [-]
			 */

			results = queryIntervalsByPositions(0, 4);
			assertSequenceIntervalsEqual(testSharedString, results, [
				{ start: 1, end: 1 },
				{ start: 2, end: 2 },
				{ start: 3, end: 4 },
			]);

			// Remove the end part of the string
			testSharedString.removeText(2, 5);

			/**
			 * Visualization of intervals within the string after the last deletion:
			 *
			 * There does not exist a next valid segment for interval2 and interval3
			 *
			 *                  0 1
			 *                  a b
			 *  interval1         ^
			 *  interval2
			 *  interval3
			 */

			results = queryIntervalsByPositions(0, 1);
			assertSequenceIntervalsEqual(testSharedString, results, [{ start: 1, end: 1 }]);
		});
	});

	describe("find consistent results with `naive` method", () => {
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
				const expected = collection.findOverlappingIntervals(start, end);
				results.sort(compareFn);
				expected.sort(compareFn);

				assertSequenceIntervalsEqual(testSharedString, results, expected);
			}
		});
	});
});
