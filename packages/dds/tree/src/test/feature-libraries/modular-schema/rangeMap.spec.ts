/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";

import {
	RangeEntry,
	RangeMap,
	deleteFromRangeMap,
	getFirstEntryFromRangeMap,
	setInRangeMap,
	mergeRangesWithinMap,
	getAllValidEntriesFromMap,
	mergeRangesButIncremental,
	brand,
} from "../../../util/index.js";
import type { ForestRootId } from "../../../core/index.js";

function newRangeMap(): RangeMap<string | undefined> {
	return [];
}

describe("RangeMap", () => {
	it("query on empty map returns undefined", () => {
		const map = newRangeMap();
		const entry = getFirstEntryFromRangeMap(map, 5, 4);
		assert.equal(entry, undefined);
	});

	it("read one entry", () => {
		const map = newRangeMap();

		// Set keys 3-6
		setInRangeMap(map, 3, 4, "a");
		const expectedEntry: RangeEntry<string> = { start: 3, length: 4, value: "a" };

		// Read keys 0-2
		const entryBefore = getFirstEntryFromRangeMap(map, 0, 3);
		assert.equal(entryBefore, undefined);

		// Read keys 1-3
		const entryBeginning = getFirstEntryFromRangeMap(map, 1, 3);
		assert.deepEqual(entryBeginning, expectedEntry);

		// Read keys 2-7
		const entryWhole = getFirstEntryFromRangeMap(map, 2, 6);
		assert.deepEqual(entryWhole, expectedEntry);

		const entryEnd = getFirstEntryFromRangeMap(map, 6, 2);
		assert.deepEqual(entryEnd, expectedEntry);

		// Read key 7
		const entryAfter = getFirstEntryFromRangeMap(map, 7, 1);
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
		const entryFirst = getFirstEntryFromRangeMap(map, 3, 1);
		assert.deepEqual(entryFirst, expected1);

		// Read keys 5-7
		const entrySecond = getFirstEntryFromRangeMap(map, 5, 3);
		assert.deepEqual(entrySecond, expected2);

		// Read keys 4-5
		const entryBetween = getFirstEntryFromRangeMap(map, 4, 2);
		assert.equal(entryBetween, undefined);

		// Read keys 3-6
		const entryBoth = getFirstEntryFromRangeMap(map, 3, 4);
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

		const entry0 = getFirstEntryFromRangeMap(map, 0, 8);
		const expectedA: RangeEntry<string> = { start: 0, length: 1, value: "a" };
		assert.deepEqual(entry0, expectedA);

		const entry1 = getFirstEntryFromRangeMap(map, 1, 1);
		assert.deepEqual(entry1, expectedE);

		const entry3 = getFirstEntryFromRangeMap(map, 3, 2);
		assert.deepEqual(entry3, expectedE);

		const entry5 = getFirstEntryFromRangeMap(map, 5, 1);
		assert.deepEqual(entry5, expectedE);

		const entry6 = getFirstEntryFromRangeMap(map, 6, 1);
		assert.deepEqual(entry6, expectedE);

		const entry7 = getFirstEntryFromRangeMap(map, 7, 2);
		assert.deepEqual(entry7, expectedE);

		const entry8 = getFirstEntryFromRangeMap(map, 8, 1);
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

		const entry1 = getFirstEntryFromRangeMap(map, 1, 10);
		const expectedA1: RangeEntry<string> = { start: 1, length: 3, value: "a" };
		assert.deepEqual(entry1, expectedA1);

		const entry4 = getFirstEntryFromRangeMap(map, 4, 8);
		assert.deepEqual(entry4, expectedB);

		const entry7 = getFirstEntryFromRangeMap(map, 7, 4);
		const expectedA2: RangeEntry<string> = { start: 7, length: 4, value: "a" };
		assert.deepEqual(entry7, expectedA2);
	});

	describe("getAllEntriesFromMap", () => {
		it("get all entries within the given range", () => {
			const map = newRangeMap();

			setInRangeMap(map, 1, 3, "a");
			setInRangeMap(map, 6, 2, "b");

			const results = getAllValidEntriesFromMap(map, 0, 10);

			assert.deepEqual(results, [
				{ start: 1, length: 3, value: "a" },
				{ start: 6, length: 2, value: "b" },
			]);
		});

		it("get all entries within the given range but partially overlapped", () => {
			const map = newRangeMap();

			setInRangeMap(map, 1, 3, "a");
			setInRangeMap(map, 6, 2, "b");

			const results = getAllValidEntriesFromMap(map, 2, 5);

			assert.deepEqual(results, [
				{ start: 2, length: 2, value: "a" },
				{ start: 6, length: 1, value: "b" },
			]);
		});

		it("skip entries with undefined value", () => {
			const map = newRangeMap();

			setInRangeMap(map, 1, 3, "a");
			setInRangeMap(map, 6, 2, undefined);

			const results = getAllValidEntriesFromMap(map, 2, 8);

			assert.deepEqual(results, [{ start: 2, length: 2, value: "a" }]);
		});
	});

	describe("mergeRangesWithinMap", () => {
		it("merge the `connected` ranges within the map", () => {
			const map = newRangeMap();

			setInRangeMap(map, 0, 1, "b");
			setInRangeMap(map, 1, 2, "a");
			setInRangeMap(map, 3, 2, "a");
			setInRangeMap(map, 6, 1, "a");

			const newMap = mergeRangesWithinMap(map);

			assert.deepEqual(newMap, [
				{ start: 0, length: 1, value: "b" },
				{ start: 1, length: 4, value: "a" },
				{ start: 6, length: 1, value: "a" },
			]);
		});
	});

	describe("mergeRnagesButIncremental", () => {
		it("merge the `connected` ranges within the map", () => {
			const map: RangeEntry<ForestRootId>[] = [];

			setInRangeMap(map, 0, 1, brand(1));
			setInRangeMap(map, 1, 1, brand(2));
			setInRangeMap(map, 2, 2, brand(3));
			setInRangeMap(map, 4, 1, brand(4));

			const newMap = mergeRangesButIncremental(map);

			assert.deepEqual(newMap, [
				{ start: 0, length: 4, value: 1 },
				{ start: 4, length: 1, value: 4 },
			]);
		});
	});

	describe("deleteFromRangeMap", () => {
		it("delete range from empty map", () => {
			const map = newRangeMap();

			// Delete keys 3-6 from an empty map
			deleteFromRangeMap(map, 3, 4);

			assert.deepEqual(map, []);
		});

		it("delete range spanning one entry", () => {
			const map = newRangeMap();

			// Set keys 2-5
			setInRangeMap(map, 2, 4, "a");

			// Delete keys 3-6
			deleteFromRangeMap(map, 3, 4);

			assert.deepEqual(map, [{ start: 2, length: 1, value: "a" }]);
		});

		it("delete range spanning multiple entries", () => {
			const map = newRangeMap();

			// Set keys 2-4
			setInRangeMap(map, 2, 3, "a");

			// Set keys 6-7
			setInRangeMap(map, 6, 2, "b");

			// Set keys 9-12
			setInRangeMap(map, 9, 4, "c");

			// Delete keys 4-8
			deleteFromRangeMap(map, 4, 5);

			assert.deepEqual(map, [
				{ start: 2, length: 2, value: "a" },
				{ start: 9, length: 4, value: "c" },
			]);
		});

		it("delete an entire entry", () => {
			const map = newRangeMap();

			// Set keys 2-5
			setInRangeMap(map, 2, 4, "a");

			// Set keys 7-9
			setInRangeMap(map, 7, 3, "b");

			// Delete keys 2-5
			deleteFromRangeMap(map, 2, 4);

			assert.deepEqual(map, [{ start: 7, length: 3, value: "b" }]);
		});

		it("delete range at startpoint of an entry", () => {
			const map = newRangeMap();

			// Set keys 2-5
			setInRangeMap(map, 2, 4, "a");

			// Set keys 7-9
			setInRangeMap(map, 7, 3, "b");

			// Delete keys 4-6
			deleteFromRangeMap(map, 4, 3);

			assert.deepEqual(map, [
				{ start: 2, length: 2, value: "a" },
				{ start: 7, length: 3, value: "b" },
			]);
		});

		it("delete range at endpoint of an entry", () => {
			const map = newRangeMap();

			// Set keys 2-5
			setInRangeMap(map, 2, 4, "a");

			// Set keys 7-9
			setInRangeMap(map, 7, 3, "b");

			// Delete keys 5-8
			deleteFromRangeMap(map, 5, 4);

			assert.deepEqual(map, [
				{ start: 2, length: 3, value: "a" },
				{ start: 9, length: 1, value: "b" },
			]);
		});

		it("delete range splitting an entry", () => {
			const map = newRangeMap();

			// Set keys 2-7
			setInRangeMap(map, 2, 6, "a");

			// Delete keys 4-6
			deleteFromRangeMap(map, 4, 3);

			assert.deepEqual(map, [
				{ start: 2, length: 2, value: "a" },
				{ start: 7, length: 1, value: "a" },
			]);
		});
	});
});
