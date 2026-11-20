/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	compareChangesetLocalIds,
	comparePartialRevisions,
	subtractChangeAtomIds,
	type ChangeAtomId,
	type ChangesetLocalId,
	type RevisionTag,
} from "../core/index.js";
import { newTupleBTree, type RangeQueryResult, type TupleBTree } from "../util/index.js";

/**
 * A BTree which uses ChangeAtomId flattened into a tuple as the key.
 * @remarks
 * Read values with {@link getFromChangeAtomIdMap} and write values with {@link setInChangeAtomIdMap}.
 */
export type ChangeAtomIdBTree<V> = TupleBTree<
	readonly [RevisionTag | undefined, ChangesetLocalId],
	V
>;

/** Creates a new {@link ChangeAtomIdBTree} */
export function newChangeAtomIdBTree<V>(
	entries?: [readonly [RevisionTag | undefined, ChangesetLocalId], V][],
): ChangeAtomIdBTree<V> {
	return newTupleBTree(compareKeys, entries);
}

/**
 * Compares the keys of a {@link ChangeAtomIdBTree}: by revision, then by local ID.
 * @remarks
 * The same order as `createTupleComparator` with these two comparators gives, without its per-element dispatch,
 * since these maps are used on every edit, compose and rebase.
 */
function compareKeys(
	a: readonly [RevisionTag | undefined, ChangesetLocalId],
	b: readonly [RevisionTag | undefined, ChangesetLocalId],
): number {
	return comparePartialRevisions(a[0], b[0]) || compareChangesetLocalIds(a[1], b[1]);
}

export function getFromChangeAtomIdMap<T>(
	map: ChangeAtomIdBTree<T>,
	id: ChangeAtomId,
): T | undefined {
	return map.get([id.revision, id.localId]);
}

export function setInChangeAtomIdMap<T>(
	map: ChangeAtomIdBTree<T>,
	id: ChangeAtomId,
	value: T,
): boolean {
	return map.set([id.revision, id.localId], value);
}

export function rangeQueryChangeAtomIdMap<T>(
	map: ChangeAtomIdBTree<T>,
	id: ChangeAtomId,
	count: number,
): RangeQueryResult<T | undefined> {
	const pair = map.getPairOrNextHigher([id.revision, id.localId]);
	if (pair === undefined) {
		return { value: undefined, length: count };
	}

	const [[revision, localId], value] = pair;
	const lengthBefore = subtractChangeAtomIds({ revision, localId }, id);
	if (lengthBefore === 0) {
		return { value, length: 1 };
	}

	return { value: undefined, length: Math.min(lengthBefore, count) };
}
