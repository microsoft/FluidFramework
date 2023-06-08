/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { reservedRangeLabelsKey, PropertySet, Client } from "@fluidframework/merge-tree";
import { IIntervalHelpers, Interval, createEndpointInRangeIndex } from "../intervalCollection";

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
		endpointInRangeIndex.add(new Interval(1, 1));
		endpointInRangeIndex.add(new Interval(1, 3));

		results = endpointInRangeIndex.findIntervalsWithEndpointInRange(2, 1);
		assert.equal(results.length, 0, "The start value should not be lower than the end value");

		results = endpointInRangeIndex.findIntervalsWithEndpointInRange(0, 1);
		assert.equal(results.length, 0, "The start value should be larger than 0");

		results = endpointInRangeIndex.findIntervalsWithEndpointInRange(-2, -1);
		assert.equal(results.length, 0, "The endpoint value should not be negative");
	});

	it("can find correct results after adding multiple intervals", () => {
		endpointInRangeIndex.add(new Interval(1, 1));
		endpointInRangeIndex.add(new Interval(1, 3));

		results = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 1);
		assertPlainNumberIntervals(results, [{ start: 1, end: 1 }]);

		results = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 3);
		assertPlainNumberIntervals(results, [
			{ start: 1, end: 1 },
			{ start: 1, end: 3 },
		]);

		endpointInRangeIndex.add(new Interval(2, 4));
		endpointInRangeIndex.add(new Interval(3, 5));
		results = endpointInRangeIndex.findIntervalsWithEndpointInRange(3, 5);
		results.sort(compareFn);
		assertPlainNumberIntervals(results, [
			{ start: 1, end: 3 },
			{ start: 2, end: 4 },
			{ start: 3, end: 5 },
		]);
	});

	it("can find correct results after removing intervals", () => {
		const interval1 = new Interval(1, 1);
		const interval2 = new Interval(1, 3);
		endpointInRangeIndex.add(interval1);
		endpointInRangeIndex.add(interval2);
		endpointInRangeIndex.remove(interval1);

		results = endpointInRangeIndex.findIntervalsWithEndpointInRange(1, 2);
		assert.equal(results.length, 0);

		const interval3 = new Interval(2, 4);
		endpointInRangeIndex.add(interval3);
		endpointInRangeIndex.remove(interval2);

		results = endpointInRangeIndex.findIntervalsWithEndpointInRange(3, 5);
		assertPlainNumberIntervals(results, [{ start: 2, end: 4 }]);
	});
});
