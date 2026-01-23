/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ChangeAtomId, ChangesetLocalId, RevisionTag } from "../core/index.js";
import type { TupleBTree } from "../util/index.js";

/**
 * A BTree which uses ChangeAtomId flattened into a tuple as the key.
 * @remarks
 * Read values with {@link getFromChangeAtomIdMap} and write values with {@link setInChangeAtomIdMap}.
 */
export type ChangeAtomIdBTree<V> = TupleBTree<
	readonly [RevisionTag | undefined, ChangesetLocalId],
	V
>;

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
): void {
	map.set([id.revision, id.localId], value);
}
