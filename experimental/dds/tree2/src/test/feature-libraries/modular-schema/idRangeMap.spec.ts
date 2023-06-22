/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
// eslint-disable-next-line import/no-internal-modules
import { IdRangeMap, getFirstFromRangeMap } from "../../../feature-libraries/modular-schema";
import { brand } from "../../../util";
import {
	CrossFieldRange,
	setInRangeMap,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/modular-schema/crossFieldQueries";

function newRangeMap(): IdRangeMap<string> {
	return [];
}

describe("IdRangeMap", () => {
	it("query on empty map returns undefined", () => {
		const map = newRangeMap();
		const entry = getFirstFromRangeMap(map, brand(5), 4);
		assert.equal(entry, undefined);
	});

	it("read one entry", () => {
		const map = newRangeMap();

		// Set IDs 3-6
		setInRangeMap(map, brand(3), 4, "a");
		const expectedEntry: CrossFieldRange<string> = { id: brand(3), length: 4, data: "a" };

		// Read IDs 0-2
		const entryBefore = getFirstFromRangeMap(map, brand(0), 3);
		assert.equal(entryBefore, undefined);

		// Read IDs 1-3
		const entryBeginning = getFirstFromRangeMap(map, brand(1), 3);
		assert.deepEqual(entryBeginning, expectedEntry);

		// Read IDs 2-7
		const entryWhole = getFirstFromRangeMap(map, brand(2), 6);
		assert.deepEqual(entryWhole, expectedEntry);

		const entryEnd = getFirstFromRangeMap(map, brand(6), 2);
		assert.deepEqual(entryEnd, expectedEntry);

		// Read ID 7
		const entryAfter = getFirstFromRangeMap(map, brand(7), 1);
		assert.equal(entryAfter, undefined);
	});

	it("read two entries", () => {
		const map = newRangeMap();

		// Set IDs 2-3
		setInRangeMap(map, brand(2), 2, "a");
		const expected1: CrossFieldRange<string> = { id: brand(2), length: 2, data: "a" };

		// Set IDs 6-6
		setInRangeMap(map, brand(6), 1, "b");
		const expected2: CrossFieldRange<string> = { id: brand(6), length: 1, data: "b" };

		// Read ID 3
		const entryFirst = getFirstFromRangeMap(map, brand(3), 1);
		assert.deepEqual(entryFirst, expected1);

		// Read IDs 5-7
		const entrySecond = getFirstFromRangeMap(map, brand(5), 3);
		assert.deepEqual(entrySecond, expected2);

		// Read IDs 4-5
		const entryBetween = getFirstFromRangeMap(map, brand(4), 2);
		assert.equal(entryBetween, undefined);

		// Read IDs 3-6
		const entryBoth = getFirstFromRangeMap(map, brand(3), 4);
		assert.deepEqual(entryBoth, expected1);
	});

	it("write overlapping ranges", () => {
		const map = newRangeMap();

		// Set IDs 0-1
		setInRangeMap(map, brand(0), 2, "a");

		// Set IDs 3-4
		setInRangeMap(map, brand(3), 2, "b");

		// Set ID 6
		setInRangeMap(map, brand(6), 1, "c");

		// Set IDs 7-8
		setInRangeMap(map, brand(7), 2, "d");

		// Set IDs 1-7
		setInRangeMap(map, brand(1), 7, "e");
		const expectedE: CrossFieldRange<string> = { id: brand(1), length: 7, data: "e" };

		const entry0 = getFirstFromRangeMap(map, brand(0), 8);
		const expectedA: CrossFieldRange<string> = { id: brand(0), length: 1, data: "a" };
		assert.deepEqual(entry0, expectedA);

		const entry1 = getFirstFromRangeMap(map, brand(1), 1);
		assert.deepEqual(entry1, expectedE);

		const entry3 = getFirstFromRangeMap(map, brand(3), 2);
		assert.deepEqual(entry3, expectedE);

		const entry5 = getFirstFromRangeMap(map, brand(5), 1);
		assert.deepEqual(entry5, expectedE);

		const entry6 = getFirstFromRangeMap(map, brand(6), 1);
		assert.deepEqual(entry6, expectedE);

		const entry7 = getFirstFromRangeMap(map, brand(7), 2);
		assert.deepEqual(entry7, expectedE);

		const entry8 = getFirstFromRangeMap(map, brand(8), 1);
		const expectedD: CrossFieldRange<string> = { id: brand(8), length: 1, data: "d" };
		assert.deepEqual(entry8, expectedD);
	});

	it("write range which splits existing range", () => {
		const map = newRangeMap();

		// Set IDs 1-10
		setInRangeMap(map, brand(1), 10, "a");

		// Set IDs 4-6
		setInRangeMap(map, brand(4), 3, "b");
		const expectedB: CrossFieldRange<string> = { id: brand(4), length: 3, data: "b" };

		const entry1 = getFirstFromRangeMap(map, brand(1), 10);
		const expectedA1: CrossFieldRange<string> = { id: brand(1), length: 3, data: "a" };
		assert.deepEqual(entry1, expectedA1);

		const entry4 = getFirstFromRangeMap(map, brand(4), 8);
		assert.deepEqual(entry4, expectedB);

		const entry7 = getFirstFromRangeMap(map, brand(7), 4);
		const expectedA2: CrossFieldRange<string> = { id: brand(7), length: 4, data: "a" };
		assert.deepEqual(entry7, expectedA2);
	});
});
