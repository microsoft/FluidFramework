/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { RevisionTag } from "../../core";
import { brand, getOrAddInMap } from "../../util";
import { IdAllocator } from "./fieldChangeHandler";
import { ChangesetLocalId } from "./modularChangeTypes";

export type CrossFieldMap<T> = Map<RevisionTag | undefined, IdRangeMap<T>>;
export type CrossFieldQuerySet = CrossFieldMap<boolean>;

export function addCrossFieldQuery(
	set: CrossFieldQuerySet,
	revision: RevisionTag | undefined,
	id: ChangesetLocalId,
	count: number,
): void {
	const rangeMap = getOrAddInMap(set, revision, []);
	setInRangeMap(rangeMap, id, count, true);
}

export function getFirstFromRangeMap<T>(
	map: IdRangeMap<T>,
	id: ChangesetLocalId,
	count: number,
): CrossFieldRange<T> | undefined {
	for (const range of map) {
		if (range.id >= (id as number) + count) {
			break;
		}

		if ((range.id as number) + range.length > id) {
			return range;
		}
	}

	return undefined;
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
): CrossFieldRange<T> | undefined {
	return getFirstFromRangeMap(map.get(revision) ?? [], id, count);
}

export function setInRangeMap<T>(
	map: IdRangeMap<T>,
	id: ChangesetLocalId,
	count: number,
	value: T,
): void {
	const lastTargetId: ChangesetLocalId = brand((id as number) + count - 1);
	const newEntry: CrossFieldRange<T> = { id, length: count, data: value };

	let iBefore = -1;
	let iAfter = map.length;
	for (const [i, entry] of map.entries()) {
		const entryLastId = (entry.id as number) + entry.length - 1;
		if (entryLastId < id) {
			iBefore = i;
		} else if (entry.id > lastTargetId) {
			iAfter = i;
			break;
		}
	}

	const numOverlappingEntries = iAfter - iBefore - 1;
	if (numOverlappingEntries === 0) {
		map.splice(iAfter, 0, newEntry);
		return;
	}

	const iFirst = iBefore + 1;
	const firstEntry = map[iFirst];
	const iLast = iAfter - 1;
	const lastEntry = map[iLast];
	const lengthBeforeFirst = id - firstEntry.id;
	const lastEntryId = (lastEntry.id as number) + lastEntry.length - 1;
	const lengthAfterLast = lastEntryId - lastTargetId;

	if (lengthBeforeFirst > 0 && lengthAfterLast > 0 && iFirst === iLast) {
		// The new entry fits in the middle of an existing entry.
		// We replace the existing entry with:
		// 1) the portion which comes before `newEntry`
		// 2) `newEntry`
		// 3) the portion which comes after `newEntry`
		map.splice(iFirst, 1, { ...firstEntry, length: lengthBeforeFirst }, newEntry, {
			...lastEntry,
			id: brand((lastTargetId as number) + 1),
			length: lengthAfterLast,
		});
		return;
	}

	if (lengthBeforeFirst > 0) {
		map[iFirst] = { ...firstEntry, length: lengthBeforeFirst };

		// The entry at `iFirst` is no longer overlapping with `newEntry`.
		iBefore = iFirst;
	}

	if (lengthAfterLast > 0) {
		map[iLast] = {
			...lastEntry,
			id: brand((lastTargetId as number) + 1),
			length: lengthAfterLast,
		};

		// The entry at `iLast` is no longer overlapping with `newEntry`.
		iAfter = iLast;
	}

	const numContainedEntries = iAfter - iBefore - 1;
	map.splice(iBefore + 1, numContainedEntries, newEntry);
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
	): CrossFieldRange<T> | undefined;

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
		invalidateDependents: boolean, // TODO: Is this still needed?
	): void;
}

/**
 * @alpha
 */
export interface CrossFieldRange<T> {
	id: ChangesetLocalId;
	length: number;
	data: T;
}

export type IdRangeMap<T> = CrossFieldRange<T>[];

export interface IdAllocationState {
	maxId: ChangesetLocalId;
}

/**
 * @alpha
 */
export function idAllocatorFromMaxId(maxId: ChangesetLocalId | undefined = undefined): IdAllocator {
	return idAllocatorFromState({ maxId: maxId ?? brand(-1) });
}

export function idAllocatorFromState(state: IdAllocationState): IdAllocator {
	return (c?: number) => {
		const count = c ?? 1;
		assert(count > 0, 0x5cf /* Must allocate at least one ID */);
		const id: ChangesetLocalId = brand((state.maxId as number) + 1);
		state.maxId = brand((state.maxId as number) + count);
		return id;
	};
}
