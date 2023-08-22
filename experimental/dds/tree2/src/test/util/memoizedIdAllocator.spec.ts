/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MemoizedIdRangeAllocator } from "../../util";

describe("MemoizedIdAllocator", () => {
	it("Allocates unique IDs given unique inputs", () => {
		const allocator = MemoizedIdRangeAllocator.fromNextId();
		const id0 = allocator("A", 0, 1);
		const id12 = allocator("A", 1, 2);
		const id3 = allocator("B", 0, 1);
		assert.deepEqual(id0, [{ first: 0, count: 1 }]);
		assert.deepEqual(id12, [{ first: 1, count: 2 }]);
		assert.deepEqual(id3, [{ first: 3, count: 1 }]);
	});

	it("Returns the same IDs given the same inputs", () => {
		const allocator = MemoizedIdRangeAllocator.fromNextId();
		const fst_id0 = allocator("A", 0, 1);
		const fst_id12 = allocator("A", 1, 2);
		const fst_id3 = allocator("B", 0, 1);
		const snd_id0 = allocator("A", 0, 1);
		const snd_id12 = allocator("A", 1, 2);
		const snd_id3 = allocator("B", 0, 1);
		assert.deepEqual(fst_id0, snd_id0);
		assert.deepEqual(fst_id12, snd_id12);
		assert.deepEqual(fst_id3, snd_id3);
	});

	it("Handles subset range overlaps", () => {
		const allocator = MemoizedIdRangeAllocator.fromNextId(1);
		const id123 = allocator("A", 1, 3);
		assert.deepEqual(id123, [{ first: 1, count: 3 }]);
		const id2 = allocator("A", 2, 1);
		const expected = [{ first: 2, count: 1 }];
		assert.deepEqual(id2, expected);
	});

	it("Handles superset range overlaps", () => {
		const allocator = MemoizedIdRangeAllocator.fromNextId(1);
		const id2 = allocator("A", 2, 1);
		assert.deepEqual(id2, [{ first: 1, count: 1 }]);
		const id123 = allocator("A", 1, 3);
		const expected = [
			{ first: 2, count: 1 },
			{ first: 1, count: 1 },
			{ first: 3, count: 1 },
		];
		assert.deepEqual(id123, expected);
	});
});
