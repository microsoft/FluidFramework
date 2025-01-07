/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import { RangeMap } from "../../../util/index.js";

function newRangeMap(): RangeMap<string> {
	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return new RangeMap<string>();
}

describe("RangeMap", () => {
	it("query on empty map returns undefined", () => {
		const map = newRangeMap();
		const entry = map.get(5, 4);
		assert.deepEqual(entry, { length: 4, value: undefined });
	});

	it("read one entry", () => {
		const map = newRangeMap();

		// Set keys 3-6
		map.set(3, 4, "a");

		// Read keys 0-2
		const entryBefore = map.get(0, 3);
		assert.deepEqual(entryBefore, { length: 3, value: undefined });

		// Read keys 1-3
		const entryBeginning = map.get(1, 3);
		assert.deepEqual(entryBeginning, { length: 2, value: undefined });

		// Read keys 2-7
		const entryWhole = map.get(2, 6);
		assert.deepEqual(entryWhole, { length: 1, value: undefined });

		const entryEnd = map.get(6, 2);
		assert.deepEqual(entryEnd, { length: 1, value: "a" });

		// Read key 7
		const entryAfter = map.get(7, 1);
		assert.deepEqual(entryAfter, { length: 1, value: undefined });
	});

	it("read two entries", () => {
		const map = newRangeMap();

		// Set keys 2-3
		map.set(2, 2, "a");

		// Set keys 6-6
		map.set(6, 1, "b");

		// Read key 3
		const entryFirst = map.get(3, 1);
		assert.deepEqual(entryFirst, { length: 1, value: "a" });

		// Read keys 5-7
		const entrySecond = map.get(5, 3);
		assert.deepEqual(entrySecond, { length: 1, value: undefined });

		// Read keys 4-5
		const entryBetween = map.get(4, 2);
		assert.deepEqual(entryBetween, { length: 2, value: undefined });

		// Read keys 3-6
		const entryBoth = map.get(3, 4);
		assert.deepEqual(entryBoth, { length: 1, value: "a" });
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

		const entry0 = map.get(0, 8);
		assert.deepEqual(entry0, { length: 1, value: "a" });

		const entry1 = map.get(1, 1);
		assert.deepEqual(entry1, { length: 1, value: "e" });

		const entry3 = map.get(3, 2);
		assert.deepEqual(entry3, { length: 2, value: "e" });

		const entry5 = map.get(5, 1);
		assert.deepEqual(entry5, { length: 1, value: "e" });

		const entry6 = map.get(6, 1);
		assert.deepEqual(entry6, { length: 1, value: "e" });

		const entry7 = map.get(7, 2);
		assert.deepEqual(entry7, { length: 1, value: "e" });

		const entry8 = map.get(8, 1);
		assert.deepEqual(entry8, { length: 1, value: "d" });
	});

	it("write range which splits existing range", () => {
		const map = newRangeMap();

		// Set keys 1-10
		map.set(1, 10, "a");

		// Set keys 4-6
		map.set(4, 3, "b");

		const entry1 = map.get(1, 10);
		assert.deepEqual(entry1, { length: 3, value: "a" });

		const entry4 = map.get(4, 8);
		assert.deepEqual(entry4, { length: 3, value: "b" });

		const entry7 = map.get(7, 4);
		assert.deepEqual(entry7, { length: 4, value: "a" });
	});

	describe("deleteFromRange", () => {
		it("delete range from empty map", () => {
			const map = newRangeMap();

			// Delete keys 3-6 from an empty map
			map.delete(3, 4);

			assert.deepEqual(map.getAllEntries(), []);
		});

		it("delete range spanning one entry", () => {
			const map = newRangeMap();

			// Set keys 2-5
			map.set(2, 4, "a");

			// Delete keys 3-6
			map.delete(3, 4);

			assert.deepEqual(map.getAllEntries(), [{ start: 2, length: 1, value: "a" }]);
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

			assert.deepEqual(map.getAllEntries(), [
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

			assert.deepEqual(map.getAllEntries(), [{ start: 7, length: 3, value: "b" }]);
		});

		it("delete range at startpoint of an entry", () => {
			const map = newRangeMap();

			// Set keys 2-5
			map.set(2, 4, "a");

			// Set keys 7-9
			map.set(7, 3, "b");

			// Delete keys 4-6
			map.delete(4, 3);

			assert.deepEqual(map.getAllEntries(), [
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

			assert.deepEqual(map.getAllEntries(), [
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

			assert.deepEqual(map.getAllEntries(), [
				{ start: 2, length: 2, value: "a" },
				{ start: 7, length: 1, value: "a" },
			]);
		});
	});
});
