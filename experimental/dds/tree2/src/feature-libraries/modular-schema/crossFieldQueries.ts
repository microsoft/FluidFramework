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
	const newEntry: CrossFieldRange<T> = { id, length: count, data: value };
	for (const [i, range] of map.entries()) {
		const lastRangeId = (range.id as number) + range.length - 1;
		const lastTargetId = (id as number) + count - 1;

		if (range.id > lastTargetId) {
			break;
		}

		if (lastRangeId < id) {
			continue;
		}

		if (range.id < id && lastRangeId > lastTargetId) {
			// range has excess portions both before and after target range
			// We replace the existing range with a range before and a range after and insert the new range
			range.length = (id as number) + count - range.id;
			map.splice(i + 1, 0, newEntry);
			map.splice(i + 2, 0, {
				id: brand((id as number) + 1),
				length: lastRangeId - id,
				data: range.data,
			});
			return;
		}

		if (range.id < id) {
			range.length = id - range.id;
		} else if (lastRangeId > lastTargetId) {
			range.id = brand((id as number) + 1);
			range.length = lastRangeId - range.id + 1;
			map.splice(i, 0, newEntry);
			return;
		} else {
			map.splice(i, 1);
		}
	}

	map.push(newEntry);
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
