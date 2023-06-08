/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { reservedRangeLabelsKey, PropertySet, Client } from "@fluidframework/merge-tree";
import { IIntervalHelpers, Interval, createStartpointInRangeIndex } from "../intervalCollection";

function createInterval(label: string, start: number, end: number): Interval {
	const rangeProp: PropertySet = {};

	if (label && label.length > 0) {
		rangeProp[reservedRangeLabelsKey] = [label];
	}

	return new Interval(start, end, rangeProp);
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
		startpointInRangeIndex.add(new Interval(1, 1));
		startpointInRangeIndex.add(new Interval(3, 4));
		results = startpointInRangeIndex.findIntervalsWithStartpointInRange(2, 1);
		assert.equal(results.length, 0, "The start value should not be lower than the end value");
		results = startpointInRangeIndex.findIntervalsWithStartpointInRange(0, 1);
		assert.equal(results.length, 0, "The start value should be larger than 0");

		results = startpointInRangeIndex.findIntervalsWithStartpointInRange(-2, -1);
		assert.equal(results.length, 0, "The endpoint value should not be negative");
	});

	it("can find correct results after adding multiple intervals", () => {
		startpointInRangeIndex.add(new Interval(1, 1));
		startpointInRangeIndex.add(new Interval(3, 4));
		results = startpointInRangeIndex.findIntervalsWithStartpointInRange(1, 1);
		assertPlainNumberIntervals(results, [{ start: 1, end: 1 }]);
		results = startpointInRangeIndex.findIntervalsWithStartpointInRange(1, 3);
		assertPlainNumberIntervals(results, [
			{ start: 1, end: 1 },
			{ start: 3, end: 4 },
		]);

		startpointInRangeIndex.add(new Interval(2, 4));
		startpointInRangeIndex.add(new Interval(4, 5));
		results = startpointInRangeIndex.findIntervalsWithStartpointInRange(1, 4);
		results.sort(compareFn);
		assertPlainNumberIntervals(results, [
			{ start: 1, end: 1 },
			{ start: 2, end: 4 },
			{ start: 3, end: 4 },
			{ start: 4, end: 5 },
		]);
	});

	it("can find correct results after removing intervals", () => {
		const interval1 = new Interval(1, 1);
		const interval2 = new Interval(3, 4);
		startpointInRangeIndex.add(interval1);
		startpointInRangeIndex.add(interval2);
		startpointInRangeIndex.remove(interval1);

		results = startpointInRangeIndex.findIntervalsWithStartpointInRange(1, 2);
		assert.equal(results.length, 0);

		const interval3 = new Interval(4, 5);
		startpointInRangeIndex.add(interval3);
		startpointInRangeIndex.remove(interval2);

		results = startpointInRangeIndex.findIntervalsWithStartpointInRange(3, 5);
		assertPlainNumberIntervals(results, [{ start: 4, end: 5 }]);
	});
});
