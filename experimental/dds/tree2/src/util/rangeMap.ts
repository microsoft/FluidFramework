/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * @alpha
 */
export interface RangeEntry<T> {
	start: number;
	length: number;
	data: T;
}

export type RangeMap<T> = RangeEntry<T>[];

export function getFirstFromRangeMap<T>(
	map: RangeMap<T>,
	start: number,
	count: number,
): RangeEntry<T> | undefined {
	for (const range of map) {
		if (range.start >= start + count) {
			break;
		}

		if (range.start + range.length > start) {
			return range;
		}
	}

	return undefined;
}

export function setInRangeMap<T>(map: RangeMap<T>, start: number, count: number, value: T): void {
	const end = start + count - 1;
	const newEntry: RangeEntry<T> = { start, length: count, data: value };

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
	const firstEntry = map[iFirst];
	const iLast = iAfter - 1;
	const lastEntry = map[iLast];
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
