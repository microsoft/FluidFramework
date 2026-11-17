/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	compareChangesetLocalIds,
	comparePartialRevisions,
	type ChangesetLocalId,
	type RevisionTag,
} from "../../core/index.js";
import { newChangeAtomIdBTree } from "../../feature-libraries/index.js";
import { brand, createTupleComparator } from "../../util/index.js";

/**
 * A revision tag for the compressed ID `id`.
 */
function revision(id: number): RevisionTag {
	return id as unknown as RevisionTag;
}

describe("ChangeAtomIdBTree", () => {
	it("orders keys by revision, then local ID, as comparing them as tuples does", () => {
		const revisions: (RevisionTag | undefined)[] = [
			undefined,
			"root",
			revision(-3),
			revision(0),
			revision(7),
		];
		const keys: [RevisionTag | undefined, ChangesetLocalId][] = [];
		for (const tag of revisions) {
			for (const localId of [5, -1, 0, 2]) {
				keys.push([tag, brand(localId)]);
			}
		}
		const tree = newChangeAtomIdBTree<number>();
		// Insert in an order unrelated to the expected one.
		for (const [index, key] of [...keys].reverse().entries()) {
			tree.set(key, index);
		}
		const tupleOrder = createTupleComparator<
			readonly [RevisionTag | undefined, ChangesetLocalId]
		>([comparePartialRevisions, compareChangesetLocalIds]);
		assert.deepEqual(tree.keysArray(), [...keys].sort(tupleOrder));
		assert.equal(tree.size, keys.length);
		for (const key of keys) {
			assert(tree.has(key));
		}
		assert(!tree.has([revision(1), brand(5)]));
	});
});
