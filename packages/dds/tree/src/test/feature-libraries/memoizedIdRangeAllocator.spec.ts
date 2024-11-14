/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ChangesetLocalId, RevisionTag } from "../../core/index.js";
import { MemoizedIdRangeAllocator } from "../../feature-libraries/index.js";
import { brand } from "../../util/index.js";
import { mintRevisionTag } from "../utils.js";

const tag1: RevisionTag = mintRevisionTag();
const tag2: RevisionTag = mintRevisionTag();

describe("MemoizedIdRangeAllocator", () => {
	it("Allocates unique IDs given unique inputs", () => {
		const allocator = MemoizedIdRangeAllocator.fromNextId();
		const id0 = allocator.allocate(tag1, brand(0), 1);
		const id12 = allocator.allocate(tag1, brand(1), 2);
		const id3 = allocator.allocate(tag2, brand(0), 1);
		assert.deepEqual(id0, [{ first: 0, count: 1 }]);
		assert.deepEqual(id12, [{ first: 1, count: 2 }]);
		assert.deepEqual(id3, [{ first: 3, count: 1 }]);
	});

	it("Returns the same IDs given the same inputs", () => {
		const allocator = MemoizedIdRangeAllocator.fromNextId();
		const fst_id0 = allocator.allocate(tag1, brand(0), 1);
		const fst_id12 = allocator.allocate(tag1, brand(1), 2);
		const fst_id3 = allocator.allocate(tag2, brand(0), 1);
		const snd_id0 = allocator.allocate(tag1, brand(0), 1);
		const snd_id12 = allocator.allocate(tag1, brand(1), 2);
		const snd_id3 = allocator.allocate(tag2, brand(0), 1);
		assert.deepEqual(fst_id0, snd_id0);
		assert.deepEqual(fst_id12, snd_id12);
		assert.deepEqual(fst_id3, snd_id3);
	});

	it("Handles subset range overlaps", () => {
		const allocator = MemoizedIdRangeAllocator.fromNextId(1);
		const id123456 = allocator.allocate(tag1, brand(1), 6);
		assert.deepEqual(id123456, [{ first: 1, count: 6 }]);
		const id23 = allocator.allocate(tag1, brand(2), 2);
		const expected = [{ first: 2, count: 2 }];
		assert.deepEqual(id23, expected);
	});

	it("Handles superset range overlaps", () => {
		const allocator = MemoizedIdRangeAllocator.fromNextId(1);
		const id23 = allocator.allocate(tag1, brand(2), 2);
		assert.deepEqual(id23, [{ first: 1, count: 2 }]);
		const id123456 = allocator.allocate(tag1, brand(1), 6);
		const expected = [
			{ first: 3, count: 1 },
			{ first: 1, count: 2 },
			{ first: 4, count: 3 },
		];
		assert.deepEqual(id123456, expected);
	});

	it("Can extend an existing range when valid", () => {
		const allocator = MemoizedIdRangeAllocator.fromNextId(1);
		const id1 = allocator.allocate(tag1, brand(1), 1);
		assert.deepEqual(id1, [{ first: 1, count: 1 }]);
		const id123 = allocator.allocate(tag1, brand(1), 3);
		assert.deepEqual(id123, [{ first: 1, count: 3 }]);
		const id4 = allocator.allocate(tag2, brand(1), 1);
		assert.deepEqual(id4, [{ first: 4, count: 1 }]);
		const id1234 = allocator.allocate(tag1, brand(1), 4);
		assert.deepEqual(id1234, [
			{ first: 1, count: 3 },
			{ first: 5, count: 1 },
		]);
	});

	it("can mint ID ranges with only a count", () => {
		const allocator = MemoizedIdRangeAllocator.fromNextId(1);
		const id1 = allocator.mint(1);
		const expectedId1: ChangesetLocalId = brand(1);
		assert.deepEqual(id1, expectedId1);
		const id234 = allocator.mint(3);
		const expectedId234: ChangesetLocalId = brand(2);
		assert.deepEqual(id234, expectedId234);
		const id5 = allocator.mint(1);
		const expectedId5: ChangesetLocalId = brand(5);
		assert.deepEqual(id5, expectedId5);
	});
});
