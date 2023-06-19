/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable jsdoc/check-indentation */

import { strict as assert } from "assert";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils";
import { LocalReferencePosition, compareReferencePositions } from "@fluidframework/merge-tree";
import { IRandom, makeRandom } from "@fluid-internal/stochastic-test-utils";
import { sequenceIntervalHelpers, IntervalType, SequenceInterval } from "../intervalCollection";
import { SharedString } from "../sharedString";
import { SharedStringFactory } from "../sequenceFactory";
import { sequenceIntervalIndexFactory } from "../intervalIndex";
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

/**
 * Generates a random string of length 2 or 1, where each character is chosen from the range 'a' to 'z'.
 */
function genreateRandomText(random: IRandom) {
	const length = random.bool(0.5) ? 2 : 1;
	let result = "";
	const characters = "abcdefghijklmnopqrstuvwxyz";

	for (let i = 0; i < length; i++) {
		result += characters[random.integer(0, 25)];
	}

	return result;
}

describe("findOverlappingIntervalsBySegoff", () => {
	const helpers = sequenceIntervalHelpers;
	// sort the query results by the local reference position of interval endpoints
	const compareFn = (a: SequenceInterval, b: SequenceInterval) => {
		if (compareReferencePositions(a.start, b.start) !== 0) {
			return compareReferencePositions(a.start, b.start);
		}
		return compareReferencePositions(a.end, b.end);
	};
	let testSharedString: TestSharedString;
	let dataStoreRuntime: MockFluidDataStoreRuntime;
	let collection;
	let overlappingIntervalsIndex;
	let results;

	const queryIntervalsByPositions = (start: number, end: number): Iterable<SequenceInterval> => {
		const startSegOff = testSharedString.client.getContainingSegment(start);
		const endSegOff = testSharedString.client.getContainingSegment(end);

		const intervals = overlappingIntervalsIndex.findOverlappingIntervals(
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
		overlappingIntervalsIndex = sequenceIntervalIndexFactory.createOverlapping(
			helpers,
			testSharedString.client,
		);
	});

	describe("find no intervals", () => {
		let interval1;
		let interval2;
		let interval3;

		beforeEach(() => {
			testSharedString.initializeLocal();
			testSharedString.insertText(0, "ab");
			testSharedString.insertText(2, "cde");
			testSharedString.insertText(5, "fg");
			collection = testSharedString.getIntervalCollection("test");
			interval1 = collection.add(1, 1, IntervalType.SlideOnRemove);
			interval2 = collection.add(2, 3, IntervalType.SlideOnRemove);
			interval3 = collection.add(5, 6, IntervalType.SlideOnRemove);
		});

		it("when the index is empty", () => {
			results = queryIntervalsByPositions(0, 2);
			assert.equal(results.length, 0);
		});

		it("when all intervals in index are above the query range", () => {
			overlappingIntervalsIndex.add(interval3);
			results = queryIntervalsByPositions(0, 2);
			assert.equal(results.length, 0);
		});

		it("when all intervals in index are below the query range", () => {
			overlappingIntervalsIndex.add(interval1);
			results = queryIntervalsByPositions(2, 5);
			assert.equal(results.length, 0);
		});

		it("when startSegment occurs `after` the endSegment", () => {
			overlappingIntervalsIndex.add(interval1);
			results = queryIntervalsByPositions(2, 0);
			assert.equal(results.length, 0);
		});

		it("when the segments are the same but startOffset occurs `after` the endOffset", () => {
			overlappingIntervalsIndex.add(interval1);
			results = queryIntervalsByPositions(1, 0);
			assert.equal(results.length, 0);
		});

		it("when the endSegment does not exist (out of bound)", () => {
			overlappingIntervalsIndex.add(interval3);
			results = queryIntervalsByPositions(1, 1000);
			assert.equal(results.length, 0);
		});
	});

	describe("find correct results", () => {
		let interval1;
		let interval2;
		let interval3;

		beforeEach(() => {
			testSharedString.initializeLocal();
			testSharedString.insertText(0, "ab");
			testSharedString.insertText(2, "cde");
			testSharedString.insertText(5, "fg");
			collection = testSharedString.getIntervalCollection("test");
			interval1 = collection.add(1, 1, IntervalType.SlideOnRemove);
			interval2 = collection.add(2, 3, IntervalType.SlideOnRemove);
			interval3 = collection.add(5, 6, IntervalType.SlideOnRemove);
			overlappingIntervalsIndex.add(interval1);
			overlappingIntervalsIndex.add(interval2);
			overlappingIntervalsIndex.add(interval3);
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
			const interval4 = collection.add(1, 3, IntervalType.SlideOnRemove);
			const interval5 = collection.add(2, 5, IntervalType.SlideOnRemove);
			const interval6 = collection.add(1, 6, IntervalType.SlideOnRemove);
			overlappingIntervalsIndex.add(interval4);
			overlappingIntervalsIndex.add(interval5);
			overlappingIntervalsIndex.add(interval6);

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
			const interval4 = collection.add(1, 1, IntervalType.SlideOnRemove);
			const interval5 = collection.add(2, 3, IntervalType.SlideOnRemove);
			const interval6 = collection.add(1, 1, IntervalType.SlideOnRemove);
			overlappingIntervalsIndex.add(interval4);
			overlappingIntervalsIndex.add(interval5);
			overlappingIntervalsIndex.add(interval6);

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
			overlappingIntervalsIndex.remove(interval2);
			results = queryIntervalsByPositions(1, 6);
			assertSequenceIntervalsEqual(testSharedString, results, [
				{ start: 1, end: 1 },
				{ start: 5, end: 6 },
			]);

			// Add and remove duplicate intervals
			const interval4 = collection.add(1, 1, IntervalType.SlideOnRemove);
			overlappingIntervalsIndex.add(interval4);
			overlappingIntervalsIndex.remove(interval1);
			results = queryIntervalsByPositions(1, 6);
			assertSequenceIntervalsEqual(testSharedString, results, [
				{ start: 1, end: 1 },
				{ start: 5, end: 6 },
			]);

			overlappingIntervalsIndex.remove(interval4);
			results = queryIntervalsByPositions(1, 6);
			assertSequenceIntervalsEqual(testSharedString, results, [{ start: 5, end: 6 }]);
		});

		it("when inserting or appending additional segments to the string", () => {
			// Append a segment to the end of the string
			testSharedString.insertText(7, "hijk");
			const interval4 = collection.add(7, 9, IntervalType.SlideOnRemove);
			overlappingIntervalsIndex.add(interval4);

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
			 * interval2's endpoint slides backwards
			 * interval3 and interval4 shift backwards
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
			 * All intervals shift backwards
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
			 * interval2's startpoint slides backwards but the remains in the original segment
			 * interval3 shifts backwards
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
		let fillInRandomSequenceIntervals;

		beforeEach(() => {
			testSharedString.initializeLocal();
			collection = testSharedString.getIntervalCollection("test");

			/**
			 * Fills in random sequence intervals to the index and interval collection
			 * @param options - The options object containing random, count, and min properties.
			 */
			fillInRandomSequenceIntervals = ({
				random,
				count,
				min,
			}: Pick<RandomIntervalOptions, "random" | "count" | "min">): void => {
				// Generate random text, and insert them into random positions of the string
				for (let i = 0; i < count / 2; ++i) {
					testSharedString.insertText(
						random.integer(0, Math.max(testSharedString.getLength() - 1, 0)),
						genreateRandomText(random),
					);
				}
				const max = testSharedString.getLength() - 1;
				// Genereate random sequence intervals
				for (let i = 0; i < count; ++i) {
					const start = random.integer(min, max);
					const end = random.integer(start, max);
					const interval = collection.add(start, end, IntervalType.SlideOnRemove);
					overlappingIntervalsIndex.add(interval);
				}
			};
		});

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
