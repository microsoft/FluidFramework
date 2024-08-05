/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { oob } from "@fluidframework/core-utils/internal";

/**
 * A map keyed on integers allowing reading and writing contiguous ranges of integer keys.
 *
 * TODO: We should avoid the direct exposure of RangeEntry. AB#7414
 */
export type RangeMap<T> = RangeEntry<T>[];

export interface RangeEntry<T> {
	start: number;
	length: number;
	value: T;
}

/**
 * The result of a query about a range of keys.
 */
export interface RangeQueryResult<T> {
	/**
	 * The value of the first key in the query range.
	 */
	value: T | undefined;

	/**
	 * The length of the prefix of the query range which have the same value.
	 * For example, if a RangeMap has the same value for keys 5, 6, and 7,
	 * a query about the range [5, 10] would give a result with length 3.
	 */
	length: number;
}

/**
 * See comments on `RangeQueryResult`.
 */
export function getFromRangeMap<T>(
	map: RangeMap<T>,
	start: number,
	length: number,
): RangeQueryResult<T> {
	for (const range of map) {
		if (range.start > start) {
			return { value: undefined, length: Math.min(range.start - start, length) };
		}

		const lastRangeKey = range.start + range.length - 1;
		if (lastRangeKey >= start) {
			// This range contains `start`.
			const overlapLength = lastRangeKey - start + 1;
			return { value: range.value, length: Math.min(overlapLength, length) };
		}
	}

	// There were no entries intersecting the query range, so the entire query range has undefined value.
	return { value: undefined, length };
}

export function getFirstEntryFromRangeMap<T>(
	map: RangeMap<T>,
	start: number,
	length: number,
): RangeEntry<T> | undefined {
	const lastQueryKey = start + length - 1;
	for (const range of map) {
		if (range.start > lastQueryKey) {
			// We've passed the end of the query range.
			break;
		}

		const lastRangeKey = range.start + range.length - 1;
		if (lastRangeKey >= start) {
			return range;
		}
	}

	return undefined;
}

/**
 * Sets the keys from `start` to `start + length - 1` to `value`.
 */
export function setInRangeMap<T>(
	map: RangeMap<T>,
	start: number,
	length: number,
	value: T,
): void {
	const end = start + length - 1;
	const newEntry: RangeEntry<T> = { start, length, value };

	let iBefore = -1;
	let iAfter = map.length;
	for (const [i, entry] of map.entries()) {
		const entryLastKey = entry.start + entry.length - 1;
		if (entryLastKey < start) {
			iBefore = i;
		} else if (entry.start > end) {
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
	const firstEntry = map[iFirst] ?? oob();
	const iLast = iAfter - 1;
	const lastEntry = map[iLast] ?? oob();
	const lengthBeforeFirst = start - firstEntry.start;
	const lastEntryKey = lastEntry.start + lastEntry.length - 1;
	const lengthAfterLast = lastEntryKey - end;

	if (lengthBeforeFirst > 0 && lengthAfterLast > 0 && iFirst === iLast) {
		// The new entry fits in the middle of an existing entry.
		// We replace the existing entry with:
		// 1) the portion which comes before `newEntry`
		// 2) `newEntry`
		// 3) the portion which comes after `newEntry`
		map.splice(iFirst, 1, { ...firstEntry, length: lengthBeforeFirst }, newEntry, {
			...lastEntry,
			start: end + 1,
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
			start: end + 1,
			length: lengthAfterLast,
		};

		// The entry at `iLast` is no longer overlapping with `newEntry`.
		iAfter = iLast;
	}

	const numContainedEntries = iAfter - iBefore - 1;
	map.splice(iBefore + 1, numContainedEntries, newEntry);
}

/**
 * Delete the keys from `start` to `start + length - 1`
 *
 * 1. If an entry is completely included in the deletion range, the whole entry will be deleted
 * e.g.: map = [[1, 2], [4, 6]], delete range: [3, 6]
 * map becomes [[1, 2]] after deletion
 * (Note: the notation [a, b] represents start = a, end = b for simpler visiualization, instead of `b`
 * representing the length)
 *
 * 2. If an entry is partially overlapped with the deletion range, the start or end point will be shifted
 * e.g.: map = [[1, 2], [4, 6]], delete range: [2, 4]
 * map becomes [[1, 1], [5, 6]] after deletion
 *
 * 3. If an entry completely includes the deletion range, the original entry may be split into two.
 * e.g.: map = [[1, 6]], delete range: [2, 4]
 * map becomes [[1, 1], [5, 6]]
 *
 * TODO: We may find ways to mitigate the code duplication between set and delete, and we need to better
 * document the API.  AB#7413
 */
export function deleteFromRangeMap<T>(map: RangeMap<T>, start: number, length: number): void {
	const end = start + length - 1;

	let iBefore = -1;
	let iAfter = map.length;

	for (const [i, entry] of map.entries()) {
		const entryLastKey = entry.start + entry.length - 1;
		if (entryLastKey < start) {
			iBefore = i;
		} else if (entry.start > end) {
			iAfter = i;
			break;
		}
	}

	const numOverlappingEntries = iAfter - iBefore - 1;

	if (numOverlappingEntries === 0) {
		// No entry will be removed
		return;
	}

	const iFirst = iBefore + 1;
	const iLast = iAfter - 1;

	// Update or remove the overlapping entries
	for (let i = iFirst; i <= iLast; ++i) {
		const entry = map[i] ?? oob();
		const entryLastKey = entry.start + entry.length - 1;
		let isDirty = false;

		// If the entry lies within the range to be deleted, remove it
		if (entry.start >= start && entryLastKey <= end) {
			map.splice(i, 1);
		} else {
			// If the entry partially or completely overlaps with the range to be deleted
			if (entry.start < start) {
				// Update the endpoint and length of the portion before the range to be deleted
				const lengthBefore = start - entry.start;
				map[i] = { ...entry, length: lengthBefore };
				isDirty = true;
			}

			if (entryLastKey > end) {
				// Update the startpoint and length of the portion after the range to be deleted
				const newStart = end + 1;
				const newLength = entryLastKey - end;
				map.splice(isDirty ? i + 1 : i, isDirty ? 0 : 1, {
					start: newStart,
					length: newLength,
					value: entry.value,
				});
			}
		}
	}
}
