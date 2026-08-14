/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { makeRandom } from "@fluid-private/stochastic-test-utils";
import { MockFluidDataStoreRuntime } from "@fluidframework/test-runtime-utils/internal";

import {
	createOverlappingIntervalsIndex,
	type ISequenceOverlappingIntervalsIndex,
} from "../intervalIndex/index.js";
import type { SequenceInterval } from "../intervals/index.js";
import { SharedStringFactory } from "../sequenceFactory.js";
import { ISharedString, SharedStringClass } from "../sharedString.js";

import { createTestSequenceInterval } from "./intervalIndexTestUtils.js";

const stringLength = 100;

describe("OverlappingIntervalsIndex", () => {
	let index: ISequenceOverlappingIntervalsIndex;
	let sharedString: ISharedString;
	let createTestInterval: (p1: number, p2: number) => SequenceInterval;

	/**
	 * Renders intervals as `[start, end]` position pairs so that assertion failures report
	 * something readable.
	 */
	function describeIntervals(intervals: readonly SequenceInterval[]): string[] {
		return intervals.map(
			(interval) =>
				`[${sharedString.localReferencePositionToPosition(
					interval.start,
				)}, ${sharedString.localReferencePositionToPosition(interval.end)}]`,
		);
	}

	function assertIntervals(
		actual: readonly SequenceInterval[],
		expected: readonly SequenceInterval[],
		message: string,
	): void {
		assert.deepEqual(describeIntervals(actual), describeIntervals(expected), message);
	}

	beforeEach(() => {
		const dataStoreRuntime = new MockFluidDataStoreRuntime({ clientId: "1" });
		sharedString = new SharedStringClass(
			dataStoreRuntime,
			"test-string",
			SharedStringFactory.Attributes,
		);
		Array.from({ length: stringLength / 10 }).forEach(() =>
			sharedString.insertText(0, "0123456789"),
		);
		index = createOverlappingIntervalsIndex(sharedString);
		createTestInterval = (p1, p2) => createTestSequenceInterval(sharedString, p1, p2);
	});

	describe("findOverlappingIntervals", () => {
		it("returns nothing when the index is empty", () => {
			assert.deepEqual(index.findOverlappingIntervals(10, 20), []);
		});

		it("returns nothing when no interval overlaps the queried range", () => {
			index.add(createTestInterval(10, 20));
			index.add(createTestInterval(40, 50));

			assert.deepEqual(index.findOverlappingIntervals(25, 35), []);
		});

		it("returns intervals which merely touch the queried range", () => {
			const endsAtStart = createTestInterval(5, 10);
			const startsAtEnd = createTestInterval(20, 25);
			const outsideBefore = createTestInterval(5, 9);
			const outsideAfter = createTestInterval(21, 25);
			for (const interval of [endsAtStart, startsAtEnd, outsideBefore, outsideAfter]) {
				index.add(interval);
			}

			assertIntervals(
				index.findOverlappingIntervals(10, 20),
				[endsAtStart, startsAtEnd],
				"expected only the intervals sharing a position with the queried range",
			);
		});

		it("returns intervals which contain the queried range", () => {
			const containing = createTestInterval(0, stringLength - 1);
			index.add(containing);

			assertIntervals(
				index.findOverlappingIntervals(50, 51),
				[containing],
				"expected the containing interval",
			);
		});

		it("returns results ordered by start position, then end position", () => {
			const third = createTestInterval(15, 30);
			const first = createTestInterval(5, 40);
			const second = createTestInterval(15, 21);
			for (const interval of [third, first, second]) {
				index.add(interval);
			}

			assertIntervals(
				index.findOverlappingIntervals(20, 25),
				[first, second, third],
				"expected results in interval order regardless of insertion order",
			);
		});

		it("returns every interval sharing the same endpoints", () => {
			const first = createTestInterval(10, 20);
			const second = createTestInterval(10, 20);
			const third = createTestInterval(10, 20);
			for (const interval of [first, second, third]) {
				index.add(interval);
			}

			assert.equal(
				index.findOverlappingIntervals(10, 20).length,
				3,
				"expected intervals sharing endpoints to be stored individually",
			);
		});

		it("finds a document-spanning interval from a query at the end of the document", () => {
			// Intervals are ordered by start position, so a query near the end of the document
			// must not lose track of a long interval which started near its beginning.
			const spanning = createTestInterval(0, stringLength - 1);
			index.add(spanning);
			for (let start = 0; start < stringLength - 10; start += 10) {
				index.add(createTestInterval(start, start + 1));
			}

			assertIntervals(
				index.findOverlappingIntervals(stringLength - 5, stringLength - 1),
				[spanning],
				"expected the document-spanning interval",
			);
		});

		it("stops returning an interval once it is removed", () => {
			const removed = createTestInterval(10, 20);
			const retained = createTestInterval(10, 20);
			index.add(removed);
			index.add(retained);

			index.remove(removed);

			assertIntervals(
				index.findOverlappingIntervals(10, 20),
				[retained],
				"expected only the interval which was not removed",
			);
		});

		it("ignores adding the same interval twice", () => {
			const interval = createTestInterval(10, 20);
			index.add(interval);
			index.add(interval);

			assertIntervals(
				index.findOverlappingIntervals(10, 20),
				[interval],
				"expected the interval to be stored only once",
			);
		});

		it("ignores removal of an interval which was never added", () => {
			const added = createTestInterval(10, 20);
			index.add(added);

			index.remove(createTestInterval(10, 20));

			assertIntervals(
				index.findOverlappingIntervals(10, 20),
				[added],
				"expected the added interval to survive an unrelated removal",
			);
		});

		it("agrees with a brute force scan over random intervals and queries", () => {
			const random = makeRandom(0xdeadbeef);
			const intervals: SequenceInterval[] = [];
			for (let i = 0; i < 200; i++) {
				const start = random.integer(0, stringLength - 1);
				const interval = createTestInterval(start, random.integer(start, stringLength - 1));
				intervals.push(interval);
				index.add(interval);
			}
			const positionOf = (interval: SequenceInterval): { start: number; end: number } => ({
				start: sharedString.localReferencePositionToPosition(interval.start),
				end: sharedString.localReferencePositionToPosition(interval.end),
			});

			for (let query = 0; query < 200; query++) {
				const start = random.integer(0, stringLength - 1);
				const end = random.integer(start, stringLength - 1);
				const expected = intervals.filter((interval) => {
					const position = positionOf(interval);
					return position.start <= end && position.end >= start;
				});

				assert.equal(
					index.findOverlappingIntervals(start, end).length,
					expected.length,
					`mismatched overlap count for [${start}, ${end}]`,
				);
			}
		});

		it("agrees with a brute force scan as intervals are added and removed", () => {
			const random = makeRandom(0x5ca1ab1e);
			const live: SequenceInterval[] = [];
			const positionOf = (interval: SequenceInterval): { start: number; end: number } => ({
				start: sharedString.localReferencePositionToPosition(interval.start),
				end: sharedString.localReferencePositionToPosition(interval.end),
			});
			const sorted = (intervals: readonly SequenceInterval[]): string[] =>
				describeIntervals(intervals).sort();

			// Each round grows the set and then shrinks it by a random amount, so the queries below
			// run against many different array lengths - including the non power of two lengths
			// which give the segment tree its most lopsided shapes.
			for (let round = 0; round < 20; round++) {
				for (let i = 0; i < random.integer(1, 15); i++) {
					const start = random.integer(0, stringLength - 1);
					const interval = createTestInterval(start, random.integer(start, stringLength - 1));
					live.push(interval);
					index.add(interval);
				}

				for (let i = random.integer(0, live.length); i > 0; i--) {
					const [removed] = live.splice(random.integer(0, live.length - 1), 1);
					index.remove(removed);
				}

				for (let query = 0; query < 25; query++) {
					const start = random.integer(0, stringLength - 1);
					const end = random.integer(start, stringLength - 1);
					const expected = live.filter((interval) => {
						const position = positionOf(interval);
						return position.start <= end && position.end >= start;
					});

					assert.deepEqual(
						sorted(index.findOverlappingIntervals(start, end)),
						sorted(expected),
						`mismatched overlaps for [${start}, ${end}] with ${live.length} intervals`,
					);
				}
			}
		});
	});

	describe("gatherIterationResults", () => {
		let first: SequenceInterval;
		let second: SequenceInterval;
		let third: SequenceInterval;

		beforeEach(() => {
			first = createTestInterval(10, 20);
			second = createTestInterval(10, 30);
			third = createTestInterval(40, 50);
			for (const interval of [first, second, third]) {
				index.add(interval);
			}
		});

		it("gathers every interval when no bounds are given", () => {
			const results: SequenceInterval[] = [];
			index.gatherIterationResults(results, true);

			assertIntervals(results, [first, second, third], "expected every interval, in order");
		});

		it("gathers every interval in reverse when iterating backward", () => {
			const results: SequenceInterval[] = [];
			index.gatherIterationResults(results, false);

			assertIntervals(results, [third, second, first], "expected every interval, reversed");
		});

		it("appends to the results already collected", () => {
			const results: SequenceInterval[] = [third];
			index.gatherIterationResults(results, true, 10);

			assertIntervals(
				results,
				[third, first, second],
				"expected the gathered intervals to be appended",
			);
		});

		it("gathers the intervals starting at the given position", () => {
			const results: SequenceInterval[] = [];
			index.gatherIterationResults(results, true, 10);

			assertIntervals(results, [first, second], "expected the intervals starting at 10");
		});

		it("gathers the intervals ending at the given position", () => {
			const results: SequenceInterval[] = [];
			index.gatherIterationResults(results, true, undefined, 30);

			assertIntervals(results, [second], "expected the intervals ending at 30");
		});

		it("gathers the intervals matching both the given start and end", () => {
			const alsoFirst = createTestInterval(10, 20);
			index.add(alsoFirst);

			const results: SequenceInterval[] = [];
			index.gatherIterationResults(results, true, 10, 20);

			assertIntervals(
				results,
				[first, alsoFirst],
				"expected every interval spanning exactly the queried range",
			);
		});

		it("gathers nothing when no interval matches the given start", () => {
			const results: SequenceInterval[] = [];
			index.gatherIterationResults(results, true, 11);

			assert.deepEqual(results, []);
		});
	});
});
