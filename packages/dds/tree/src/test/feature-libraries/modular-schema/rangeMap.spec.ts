/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { newIntegerRangeMap, type RangeMap } from "../../../util/index.js";

function newRangeMap(): RangeMap<number, string> {
	return newIntegerRangeMap<string>();
}

describe("RangeMap", () => {
	it("query on empty map returns undefined", () => {
		const map = newRangeMap();
		const entry = map.getFirst(5, 4);
		assert.deepEqual(entry, { start: 5, length: 4, value: undefined });
	});

	it("read one entry", () => {
		const map = newRangeMap();

		// Set keys 3-6
		map.set(3, 4, "a");

		// Read keys 0-2
		const entryBefore = map.getFirst(0, 3);
		assert.deepEqual(entryBefore, { start: 0, length: 3, value: undefined });

		// Read keys 1-3
		const entryBeginning = map.getFirst(1, 3);
		assert.deepEqual(entryBeginning, { start: 1, length: 2, value: undefined });

		// Read keys 2-7
		const entryWhole = map.getFirst(2, 6);
		assert.deepEqual(entryWhole, { start: 2, length: 1, value: undefined });

		const entryEnd = map.getFirst(6, 2);
		assert.deepEqual(entryEnd, { start: 6, length: 1, value: "a" });

		// Read key 7
		const entryAfter = map.getFirst(7, 1);
		assert.deepEqual(entryAfter, { start: 7, length: 1, value: undefined });
	});

	it("read two entries", () => {
		const map = newRangeMap();

		// Set keys 2-3
		map.set(2, 2, "a");

		// Set keys 6-6
		map.set(6, 1, "b");

		// Read key 3
		const entryFirst = map.getFirst(3, 1);
		assert.deepEqual(entryFirst, { start: 3, length: 1, value: "a" });

		// Read keys 5-7
		const entrySecond = map.getFirst(5, 3);
		assert.deepEqual(entrySecond, { start: 5, length: 1, value: undefined });

		// Read keys 4-5
		const entryBetween = map.getFirst(4, 2);
		assert.deepEqual(entryBetween, { start: 4, length: 2, value: undefined });

		// Read keys 3-6
		const entryBoth = map.getFirst(3, 4);
		assert.deepEqual(entryBoth, { start: 3, length: 1, value: "a" });
	});

	it("write overlapping ranges", () => {
		const map = newRangeMap();

		// Set keys 0-1
		map.set(0, 2, "a");

		// Set keys 3-4
		map.set(3, 2, "b");

		// Set key 6
		map.set(6, 1, "c");

		// Set keys 7-8
		map.set(7, 2, "d");

		// Set keys 1-7
		map.set(1, 7, "e");

		const entry0 = map.getFirst(0, 8);
		assert.deepEqual(entry0, { start: 0, length: 1, value: "a" });

		const entry1 = map.getFirst(1, 1);
		assert.deepEqual(entry1, { start: 1, length: 1, value: "e" });

		const entry3 = map.getFirst(3, 2);
		assert.deepEqual(entry3, { start: 3, length: 2, value: "e" });

		const entry5 = map.getFirst(5, 1);
		assert.deepEqual(entry5, { start: 5, length: 1, value: "e" });

		const entry6 = map.getFirst(6, 1);
		assert.deepEqual(entry6, { start: 6, length: 1, value: "e" });

		const entry7 = map.getFirst(7, 2);
		assert.deepEqual(entry7, { start: 7, length: 1, value: "e" });

		const entry8 = map.getFirst(8, 1);
		assert.deepEqual(entry8, { start: 8, length: 1, value: "d" });
	});

	it("write range which splits existing range", () => {
		const map = newRangeMap();

		// Set keys 1-10
		map.set(1, 10, "a");

		// Set keys 4-6
		map.set(4, 3, "b");

		const entry1 = map.getFirst(1, 10);
		assert.deepEqual(entry1, { start: 1, length: 3, value: "a" });

		const entry4 = map.getFirst(4, 8);
		assert.deepEqual(entry4, { start: 4, length: 3, value: "b" });

		const entry7 = map.getFirst(7, 4);
		assert.deepEqual(entry7, { start: 7, length: 4, value: "a" });
	});

	describe("deleteFromRange", () => {
		it("delete range from empty map", () => {
			const map = newRangeMap();

			// Delete keys 3-6 from an empty map
			map.delete(3, 4);

			assert.deepEqual(map.entries(), []);
		});

		it("delete range spanning one entry", () => {
			const map = newRangeMap();

			// Set keys 2-5
			map.set(2, 4, "a");

			// Delete keys 3-6
			map.delete(3, 4);

			assert.deepEqual(map.entries(), [{ start: 2, length: 1, value: "a" }]);
		});

		it("delete range spanning multiple entries", () => {
			const map = newRangeMap();

			// Set keys 2-4
			map.set(2, 3, "a");

			// Set keys 6-7
			map.set(6, 2, "b");

			// Set keys 9-12
			map.set(9, 4, "c");

			// Delete keys 4-8
			map.delete(4, 5);

			assert.deepEqual(map.entries(), [
				{ start: 2, length: 2, value: "a" },
				{ start: 9, length: 4, value: "c" },
			]);
		});

		it("delete an entire entry", () => {
			const map = newRangeMap();

			// Set keys 2-5
			map.set(2, 4, "a");

			// Set keys 7-9
			map.set(7, 3, "b");

			// Delete keys 2-5
			map.delete(2, 4);

			assert.deepEqual(map.entries(), [{ start: 7, length: 3, value: "b" }]);
		});

		it("delete range at startpoint of an entry", () => {
			const map = newRangeMap();

			// Set keys 2-5
			map.set(2, 4, "a");

			// Set keys 7-9
			map.set(7, 3, "b");

			// Delete keys 4-6
			map.delete(4, 3);

			assert.deepEqual(map.entries(), [
				{ start: 2, length: 2, value: "a" },
				{ start: 7, length: 3, value: "b" },
			]);
		});

		it("delete range at endpoint of an entry", () => {
			const map = newRangeMap();

			// Set keys 2-5
			map.set(2, 4, "a");

			// Set keys 7-9
			map.set(7, 3, "b");

			// Delete keys 5-8
			map.delete(5, 4);

			assert.deepEqual(map.entries(), [
				{ start: 2, length: 3, value: "a" },
				{ start: 9, length: 1, value: "b" },
			]);
		});

		it("delete range splitting an entry", () => {
			const map = newRangeMap();

			// Set keys 2-7
			map.set(2, 6, "a");

			// Delete keys 4-6
			map.delete(4, 3);

			assert.deepEqual(map.entries(), [
				{ start: 2, length: 2, value: "a" },
				{ start: 7, length: 1, value: "a" },
			]);
		});
	});
});
