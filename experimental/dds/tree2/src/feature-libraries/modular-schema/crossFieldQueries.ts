/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChangesetLocalId, RevisionTag } from "../../core";
import {
	RangeEntry,
	RangeMap,
	getFirstFromRangeMap,
	getOrAddInMap,
	setInRangeMap,
} from "../../util";

export type CrossFieldMap<T> = Map<RevisionTag | undefined, RangeMap<T>>;
export type CrossFieldQuerySet = CrossFieldMap<boolean>;

export function addCrossFieldQuery(
	set: CrossFieldQuerySet,
	revision: RevisionTag | undefined,
	id: ChangesetLocalId,
	count: number,
): void {
	setInCrossFieldMap(set, revision, id, count, true);
}

export function setInCrossFieldMap<T>(
	map: CrossFieldMap<T>,
	revision: RevisionTag | undefined,
	id: ChangesetLocalId,
	count: number,
	value: T,
): void {
	setInRangeMap(getOrAddInMap(map, revision, []), id, count, value);
}

export function getFirstFromCrossFieldMap<T>(
	map: CrossFieldMap<T>,
	revision: RevisionTag | undefined,
	id: ChangesetLocalId,
	count: number,
): RangeEntry<T> | undefined {
	return getFirstFromRangeMap(map.get(revision) ?? [], id, count);
}

/**
 * @alpha
 */
export enum CrossFieldTarget {
	Source,
	Destination,
}

/**
 * Used by {@link FieldChangeHandler} implementations for exchanging information across other fields
 * while rebasing, composing, or inverting a change.
 * @alpha
 */
export interface CrossFieldManager<T = unknown> {
	/**
	 * Returns the first data range associated with the key of `target`, `revision`, between `id` and `id + count`.
	 * Calling this records a dependency for the current field on this key if `addDependency` is true.
	 */
	get(
		target: CrossFieldTarget,
		revision: RevisionTag | undefined,
		id: ChangesetLocalId,
		count: number,
		addDependency: boolean,
	): RangeEntry<T> | undefined;

	/**
	 * If there is no data for this key, sets the value to `newValue`, then returns the data for this key.
	 * If `invalidateDependents` is true, all fields which took a dependency on this key will be considered invalidated
	 * and will be given a chance to address the new data in `amendRebase`, `amendInvert`, or `amendCompose` as appropriate.
	 */
	set(
		target: CrossFieldTarget,
		revision: RevisionTag | undefined,
		id: ChangesetLocalId,
		count: number,
		newValue: T,
		invalidateDependents: boolean,
	): void;
}
