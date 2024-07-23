/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { type NestedMap, getOrDefaultInNestedMap, setInNestedMap } from "./nestedMap.js";

export type NestedSet<Key1, Key2> = NestedMap<Key1, Key2, boolean>;

export function addToNestedSet<Key1, Key2>(
	set: NestedSet<Key1, Key2>,
	key1: Key1,
	key2: Key2,
): void {
	setInNestedMap(set, key1, key2, true);
}

export function nestedSetContains<Key1, Key2>(
	set: NestedSet<Key1, Key2>,
	key1: Key1,
	key2: Key2,
): boolean {
	return getOrDefaultInNestedMap(set, key1, key2, false);
}
