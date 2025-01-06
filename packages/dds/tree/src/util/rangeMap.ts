/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { oob } from "@fluidframework/core-utils/internal";

/**
 * RangeMap represents a mapping from integers to values of type T or undefined.
 * The values for a range of consecutive keys can be changed or queried in a single operation.
 */
export class RangeMap<T> {
	private readonly entries: RangeEntry<T>[];

	public constructor(initialEntries?: RangeEntry<T>[]) {
		this.entries = initialEntries ? [...initialEntries] : [];
	}

	/**
	 * Retrieves all entries from the rangeMap.
	 * @returns An array of RangeEntryResult objects, each containing the start index, length, and value of a contiguous range.
	 */
	public getAllEntries(): RangeQueryResult<T>[] {
		return this.entries;
	}

	/**
	 * Retrieves the value for some prefix of the query range.
	 *
	 * @param start - The first key in the query range.
	 * @param length - The length of the query range.
	 * @returns A RangeQueryResult containing the value associated with `start`,
	 * and the number of consecutive keys with that same value.
	 */
	public get(start: number, length: number): RangeQueryResult<T> {
		for (const entry of this.entries) {
			if (entry.start > start) {
				return { value: undefined, length: Math.min(entry.start - start, length) };
			}

			const lastRangeKey = entry.start + entry.length - 1;
			if (lastRangeKey >= start) {
				const overlapLength = lastRangeKey - start + 1;
				return { value: entry.value, length: Math.min(overlapLength, length) };
			}
		}

		// There were no entries intersecting the query range, so the entire query range has undefined value.
		return { value: undefined, length };
	}

	/**
	 * Sets the value for a specified range.
	 *
	 * @param start - The first key in the range being set.
	 * @param length - The length of the range.
	 * @param value - The value to associate with the range.
	 */
	public set(start: number, length: number, value: T): void {
		const end = start + length - 1;
		const newEntry: RangeEntry<T> = { start, length, value };

		let iBefore = -1;
		let iAfter = this.entries.length;
		for (const [i, entry] of this.entries.entries()) {
			const entryLastKey = entry.start + entry.length - 1;
			if (entryLastKey < start) {
				iBefore = i;
			} else if (entry.start > end) {
				iAfter = i;
				break;
			}
		}

		if (value === undefined) {
			this.delete(start, length);
			return;
		}

		const numOverlappingEntries = iAfter - iBefore - 1;
		if (numOverlappingEntries === 0) {
			this.entries.splice(iAfter, 0, newEntry);
			return;
		}

		const iFirst = iBefore + 1;
		const firstEntry = this.entries[iFirst] ?? oob();
		const iLast = iAfter - 1;
		const lastEntry = this.entries[iLast] ?? oob();
		const lengthBeforeFirst = start - firstEntry.start;
		const lastEntryKey = lastEntry.start + lastEntry.length - 1;
		const lengthAfterLast = lastEntryKey - end;

		if (lengthBeforeFirst > 0 && lengthAfterLast > 0 && iFirst === iLast) {
			// The new entry fits in the middle of an existing entry.
			// We replace the existing entry with:
			// 1) the portion which comes before `newEntry`
			// 2) `newEntry`
			// 3) the portion which comes after `newEntry`
			this.entries.splice(iFirst, 1, { ...firstEntry, length: lengthBeforeFirst }, newEntry, {
				...lastEntry,
				start: end + 1,
				length: lengthAfterLast,
			});
			return;
		}

		if (lengthBeforeFirst > 0) {
			this.entries[iFirst] = { ...firstEntry, length: lengthBeforeFirst };
			// The entry at `iFirst` is no longer overlapping with `newEntry`.
			iBefore = iFirst;
		}

		if (lengthAfterLast > 0) {
			this.entries[iLast] = {
				...lastEntry,
				start: end + 1,
				length: lengthAfterLast,
			};

			// The entry at `iLast` is no longer overlapping with `newEntry`.
			iAfter = iLast;
		}

		const numContainedEntries = iAfter - iBefore - 1;
		this.entries.splice(iBefore + 1, numContainedEntries, newEntry);
	}

	/**
	 * Deletes values within a specified range, updating or removing existing entries.
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
	 * @param start - The start of the range to delete (inclusive).
	 * @param length - The length of the range to delete.
	 */
	public delete(start: number, length: number): void {
		const end = start + length - 1;

		let iBefore = -1;
		let iAfter = this.entries.length;

		for (const [i, entry] of this.entries.entries()) {
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

		for (let i = iFirst; i <= iLast; ++i) {
			const entry = this.entries[i] ?? oob();
			const entryLastKey = entry.start + entry.length - 1;
			let isDirty = false;

			if (entry.start >= start && entryLastKey <= end) {
				// If the entry lies within the range to be deleted, remove it
				this.entries.splice(i, 1);
			} else {
				// If the entry partially or completely overlaps with the range to be deleted
				if (entry.start < start) {
					// Update the endpoint and length of the portion before the range to be deleted
					const lengthBefore = start - entry.start;
					this.entries[i] = { ...entry, length: lengthBefore };
					isDirty = true;
				}

				if (entryLastKey > end) {
					// Update the startpoint and length of the portion after the range to be deleted
					const newStart = end + 1;
					const newLength = entryLastKey - end;
					this.entries.splice(isDirty ? i + 1 : i, isDirty ? 0 : 1, {
						start: newStart,
						length: newLength,
						value: entry.value,
					});
				}
			}
		}
	}
}

/**
 * Represents a contiguous range of values in the RangeMap.
 * This interface is used internally and should not be exposed to consumers.
 */
interface RangeEntry<T> {
	/**
	 * The starting index of the range (inclusive).
	 */
	readonly start: number;

	/**
	 * The length of the range.
	 */
	readonly length: number;

	/**
	 * The value associated with this range.
	 */
	readonly value: T;
}

/**
 * Describes the result of a range query, including the value and length of the matching prefix.
 */
export interface RangeQueryResult<T> {
	/**
	 * The value of the first key in the query range.
	 * If no matching range is found, this will be undefined.
	 */
	value: T | undefined;

	/**
	 * The length of the prefix of the query range which has the same value.
	 * For example, if a RangeMap has the same value for keys 5, 6, and 7,
	 * a query about the range [5, 10] would give a result with length 3.
	 */
	length: number;
}
