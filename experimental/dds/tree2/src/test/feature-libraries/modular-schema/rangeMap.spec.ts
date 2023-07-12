/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { RangeEntry, RangeMap, getFirstFromRangeMap, setInRangeMap } from "../../../util";

function newRangeMap(): RangeMap<string> {
	return [];
}

describe("RangeMap", () => {
	it("query on empty map returns undefined", () => {
		const map = newRangeMap();
		const entry = getFirstFromRangeMap(map, 5, 4);
		assert.equal(entry, undefined);
	});

	it("read one entry", () => {
		const map = newRangeMap();

		// Set keys 3-6
		setInRangeMap(map, 3, 4, "a");
		const expectedEntry: RangeEntry<string> = { start: 3, length: 4, value: "a" };

		// Read keys 0-2
		const entryBefore = getFirstFromRangeMap(map, 0, 3);
		assert.equal(entryBefore, undefined);

		// Read keys 1-3
		const entryBeginning = getFirstFromRangeMap(map, 1, 3);
		assert.deepEqual(entryBeginning, expectedEntry);

		// Read keys 2-7
		const entryWhole = getFirstFromRangeMap(map, 2, 6);
		assert.deepEqual(entryWhole, expectedEntry);

		const entryEnd = getFirstFromRangeMap(map, 6, 2);
		assert.deepEqual(entryEnd, expectedEntry);

		// Read key 7
		const entryAfter = getFirstFromRangeMap(map, 7, 1);
		assert.equal(entryAfter, undefined);
	});

	it("read two entries", () => {
		const map = newRangeMap();

		// Set keys 2-3
		setInRangeMap(map, 2, 2, "a");
		const expected1: RangeEntry<string> = { start: 2, length: 2, value: "a" };

		// Set keys 6-6
		setInRangeMap(map, 6, 1, "b");
		const expected2: RangeEntry<string> = { start: 6, length: 1, value: "b" };

		// Read key 3
		const entryFirst = getFirstFromRangeMap(map, 3, 1);
		assert.deepEqual(entryFirst, expected1);

		// Read keys 5-7
		const entrySecond = getFirstFromRangeMap(map, 5, 3);
		assert.deepEqual(entrySecond, expected2);

		// Read keys 4-5
		const entryBetween = getFirstFromRangeMap(map, 4, 2);
		assert.equal(entryBetween, undefined);

		// Read keys 3-6
		const entryBoth = getFirstFromRangeMap(map, 3, 4);
		assert.deepEqual(entryBoth, expected1);
	});

	it("write overlapping ranges", () => {
		const map = newRangeMap();

		// Set keys 0-1
		setInRangeMap(map, 0, 2, "a");

		// Set keys 3-4
		setInRangeMap(map, 3, 2, "b");

		// Set key 6
		setInRangeMap(map, 6, 1, "c");

		// Set keys 7-8
		setInRangeMap(map, 7, 2, "d");

		// Set keys 1-7
		setInRangeMap(map, 1, 7, "e");
		const expectedE: RangeEntry<string> = { start: 1, length: 7, value: "e" };

		const entry0 = getFirstFromRangeMap(map, 0, 8);
		const expectedA: RangeEntry<string> = { start: 0, length: 1, value: "a" };
		assert.deepEqual(entry0, expectedA);

		const entry1 = getFirstFromRangeMap(map, 1, 1);
		assert.deepEqual(entry1, expectedE);

		const entry3 = getFirstFromRangeMap(map, 3, 2);
		assert.deepEqual(entry3, expectedE);

		const entry5 = getFirstFromRangeMap(map, 5, 1);
		assert.deepEqual(entry5, expectedE);

		const entry6 = getFirstFromRangeMap(map, 6, 1);
		assert.deepEqual(entry6, expectedE);

		const entry7 = getFirstFromRangeMap(map, 7, 2);
		assert.deepEqual(entry7, expectedE);

		const entry8 = getFirstFromRangeMap(map, 8, 1);
		const expectedD: RangeEntry<string> = { start: 8, length: 1, value: "d" };
		assert.deepEqual(entry8, expectedD);
	});

	it("write range which splits existing range", () => {
		const map = newRangeMap();

		// Set keys 1-10
		setInRangeMap(map, 1, 10, "a");

		// Set keys 4-6
		setInRangeMap(map, 4, 3, "b");
		const expectedB: RangeEntry<string> = { start: 4, length: 3, value: "b" };

		const entry1 = getFirstFromRangeMap(map, 1, 10);
		const expectedA1: RangeEntry<string> = { start: 1, length: 3, value: "a" };
		assert.deepEqual(entry1, expectedA1);

		const entry4 = getFirstFromRangeMap(map, 4, 8);
		assert.deepEqual(entry4, expectedB);

		const entry7 = getFirstFromRangeMap(map, 7, 4);
		const expectedA2: RangeEntry<string> = { start: 7, length: 4, value: "a" };
		assert.deepEqual(entry7, expectedA2);
	});
});
