/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { strict as assert } from "assert";
import { AppendOnlySortedMap } from "../appendOnlySortedMap.js";
import { compareFiniteNumbers } from "../utilities.js";
import { assertNotUndefined } from "./testCommon.js";

function runAppendOnlyMapTests(mapBuilder: () => AppendOnlySortedMap<number, number>) {
	it("detects out-of-order keys", () => {
		const map = mapBuilder();
		map.append(0, 0);
		const exception = "Inserted key must be > all others in the map.";
		assert.throws(
			() => map.append(-1, 1),
			(e: Error) => e.message === exception,
		);
		map.append(1, 2);
	});

	it("can get the min and max keys", () => {
		const map = mapBuilder();
		const elementCount = 10;
		assert.equal(map.maxKey(), undefined);
		for (let i = 0; i < elementCount; i++) {
			map.append(i, i);
			assert.equal(map.maxKey(), i);
			assert.equal(map.minKey(), 0);
		}
	});

	it("can get the first and last pairs", () => {
		const map = mapBuilder();
		const elementCount = 10;
		assert.equal(map.first(), undefined);
		assert.equal(map.last(), undefined);
		for (let i = 0; i < elementCount; i++) {
			map.append(i, i);
			assert.deepEqual(map.last(), [i, i]);
			assert.deepEqual(map.first(), [0, 0]);
		}
	});

	it("can get values", () => {
		const map = mapBuilder();
		const elementCount = 10;
		for (let i = 0; i < elementCount; i++) {
			map.append(i, i);
		}
		assert.equal(map.get(-1), undefined);
		assert.equal(map.get(10), undefined);
		for (let i = 0; i < elementCount; i++) {
			assert.equal(map.get(i), i);
		}
	});

	it("can get pairs by index", () => {
		const map = mapBuilder();
		const elementCount = 10;
		for (let i = 0; i < elementCount; i++) {
			map.append(i * 10, i);
		}
		assert.equal(map.getAtIndex(-1), undefined);
		assert.equal(map.getAtIndex(10), undefined);
		for (let i = 0; i < elementCount; i++) {
			assert.deepEqual(map.getAtIndex(i), [i * 10, i]);
		}
	});

	it("can get an entry or next lower by key", () => {
		[99, 100].forEach((elementCount) => {
			const map = mapBuilder();
			for (let i = 0; i < elementCount; i++) {
				map.append(i * 2, i * 2);
			}
			assert.equal(map.getPairOrNextLower(-1), undefined);
			for (let i = 0; i < map.size; i++) {
				assert.deepEqual(map.getPairOrNextLower(i * 2), [i * 2, i * 2]);
				assert.deepEqual(map.getPairOrNextLower(i * 2 + 1), [i * 2, i * 2]);
			}
			const maxKey = assertNotUndefined(map.maxKey());
			assert.deepEqual(map.getPairOrNextLower(maxKey + 1), [maxKey, maxKey]);
		});
	});

	it("can get an entry or next higher by key", () => {
		[99, 100].forEach((elementCount) => {
			const map = mapBuilder();
			for (let i = 0; i < elementCount; i++) {
				map.append(i * 2, i * 2);
			}
			const minKey = assertNotUndefined(map.minKey());
			assert.deepEqual(map.getPairOrNextHigher(minKey - 1), [minKey, minKey]);
			for (let i = 0; i < map.size - 1; i++) {
				assert.deepEqual(map.getPairOrNextHigher(i * 2), [i * 2, i * 2]);
				assert.deepEqual(map.getPairOrNextHigher(i * 2 + 1), [i * 2 + 2, i * 2 + 2]);
			}
			assert.equal(map.getPairOrNextHigher(map.size * 2 + 1), undefined);
		});
	});

	it("knows how big it is", () => {
		const map = mapBuilder();
		const elementCount = 10;
		for (let i = 0; i < elementCount; i++) {
			assert.equal(map.size, i);
			map.append(i, i);
		}
		assert.equal(map.size, elementCount);
	});

	it("can enumerate its keys and values", () => {
		const map = mapBuilder();
		const elementCount = 10;
		const keys: number[] = [];
		const values: number[] = [];
		for (let i = 0; i < elementCount; i++) {
			const key = i;
			const value = i * 2;
			map.append(key, value);
			keys.push(key);
			values.push(value);
		}
		assert.deepEqual([...map.keys()], keys);
		assert.deepEqual([...map.values()], values);
	});

	it("can calculate the indexOf a search element", () => {
		const elements: number[] = [0, 0, 2, 0, 3, 0];
		const comparator = (search: number, key: number, value: number): number => {
			return compareFiniteNumbers(search, key);
		};
		assert.equal(AppendOnlySortedMap.keyIndexOf(elements, 0, comparator), 0);
		assert.equal(AppendOnlySortedMap.keyIndexOf(elements, 2, comparator), 2);
		assert.equal(AppendOnlySortedMap.keyIndexOf(elements, 3, comparator), 4);
		assert.equal(
			AppendOnlySortedMap.keyIndexOf(elements, -1, comparator),
			0 ^ AppendOnlySortedMap.failureXor,
		);
		assert.equal(
			AppendOnlySortedMap.keyIndexOf(elements, 1, comparator),
			2 ^ AppendOnlySortedMap.failureXor,
		);
		assert.equal(
			AppendOnlySortedMap.keyIndexOf(elements, 10, comparator),
			6 ^ AppendOnlySortedMap.failureXor,
		);
	});

	describe("can perform range queries", () => {
		const map = mapBuilder();
		const elementCount = 10;
		for (let i = 0; i < elementCount; i++) {
			map.append(i * 2, i * 2);
		}
		const maxKey = assertNotUndefined(map.maxKey());

		it("on empty ranges", () => {
			assert.deepEqual([...map.getRange(1, -1)], []);
			assert.deepEqual([...map.getRange(maxKey + 1, maxKey + 1)], []);
		});

		it("on ranges of size 1", () => {
			assert.deepEqual([...map.getRange(0, 0)], [[0, 0]]);
			assert.deepEqual([...map.getRange(1, 1)], []);
			assert.deepEqual([...map.getRange(-1, -1)], []);
		});

		it("on non-empty ranges", () => {
			assert.deepEqual([...map.getRange(0, 1)], [[0, 0]]);
			assert.deepEqual(
				[...map.getRange(0, 2)],
				[
					[0, 0],
					[2, 2],
				],
			);
			assert.deepEqual(
				[...map.getRange(1, 5)],
				[
					[2, 2],
					[4, 4],
				],
			);
			const allEntries = [...map.entries()];
			assert.deepEqual([...map.getRange(0, maxKey)], allEntries);
			assert.deepEqual([...map.getRange(-maxKey, maxKey)], allEntries);
			assert.deepEqual([...map.getRange(0, 2 * maxKey)], allEntries);
			assert.deepEqual([...map.getRange(-maxKey, 2 * maxKey)], allEntries);
		});
	});
}

describe("AppendOnlySortedMap", () => {
	runAppendOnlyMapTests(() => new AppendOnlySortedMap(compareFiniteNumbers));
});
