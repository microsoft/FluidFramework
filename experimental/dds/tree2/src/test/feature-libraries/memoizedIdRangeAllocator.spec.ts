/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "assert";
import { MemoizedIdRangeAllocator } from "../../feature-libraries";
import { RevisionTag, mintRevisionTag } from "../../core";
import { brand } from "../../util";

const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();

describe("MemoizedIdRangeAllocator", () => {
	it("Allocates unique IDs given unique inputs", () => {
		const allocator = MemoizedIdRangeAllocator.fromNextId();
		const id0 = allocator(tag1, brand(0), 1);
		const id12 = allocator(tag1, brand(1), 2);
		const id3 = allocator(tag2, brand(0), 1);
		assert.deepEqual(id0, [{ first: 0, count: 1 }]);
		assert.deepEqual(id12, [{ first: 1, count: 2 }]);
		assert.deepEqual(id3, [{ first: 3, count: 1 }]);
	});

	it("Returns the same IDs given the same inputs", () => {
		const allocator = MemoizedIdRangeAllocator.fromNextId();
		const fst_id0 = allocator(tag1, brand(0), 1);
		const fst_id12 = allocator(tag1, brand(1), 2);
		const fst_id3 = allocator(tag2, brand(0), 1);
		const snd_id0 = allocator(tag1, brand(0), 1);
		const snd_id12 = allocator(tag1, brand(1), 2);
		const snd_id3 = allocator(tag2, brand(0), 1);
		assert.deepEqual(fst_id0, snd_id0);
		assert.deepEqual(fst_id12, snd_id12);
		assert.deepEqual(fst_id3, snd_id3);
	});

	it("Handles subset range overlaps", () => {
		const allocator = MemoizedIdRangeAllocator.fromNextId(1);
		const id123456 = allocator(tag1, brand(1), 6);
		assert.deepEqual(id123456, [{ first: 1, count: 6 }]);
		const id23 = allocator(tag1, brand(2), 2);
		const expected = [{ first: 2, count: 2 }];
		assert.deepEqual(id23, expected);
	});

	it("Handles superset range overlaps", () => {
		const allocator = MemoizedIdRangeAllocator.fromNextId(1);
		const id23 = allocator(tag1, brand(2), 2);
		assert.deepEqual(id23, [{ first: 1, count: 2 }]);
		const id123456 = allocator(tag1, brand(1), 6);
		const expected = [
			{ first: 3, count: 1 },
			{ first: 1, count: 2 },
			{ first: 4, count: 3 },
		];
		assert.deepEqual(id123456, expected);
	});

	it("Can extend an existing range when valid", () => {
		const allocator = MemoizedIdRangeAllocator.fromNextId(1);
		const id1 = allocator(tag1, brand(1), 1);
		assert.deepEqual(id1, [{ first: 1, count: 1 }]);
		const id123 = allocator(tag1, brand(1), 3);
		assert.deepEqual(id123, [{ first: 1, count: 3 }]);
		const id4 = allocator(tag2, brand(1), 1);
		assert.deepEqual(id4, [{ first: 4, count: 1 }]);
		const id1234 = allocator(tag1, brand(1), 4);
		assert.deepEqual(id1234, [
			{ first: 1, count: 3 },
			{ first: 5, count: 1 },
		]);
	});
});
