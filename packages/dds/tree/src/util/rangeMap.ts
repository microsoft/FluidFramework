/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { oob } from "@fluidframework/core-utils/internal";

/**
 * A data structure for efficient range-based operations on integer keys.
 *
 * RangeMap represents a mapping from non-negative integers to values of type T or undefined.
 * It ensures that range entries are sorted by start and non-overlapping.
 * Adjacent equal-valued ranges are merged.
 */
export class RangeMap<T> {
	private readonly entries: RangeEntry<T>[];

	public constructor(initialEntries?: RangeEntry<T>[]) {
		this.entries = initialEntries ? [...initialEntries] : [];
	}

	/**
	 * Retrieves all entries from the rangeMap.
	 *
	 * This method returns an array of RangeEntryResult objects, where each object represents a contiguous range of values.
	 * The returned array is a snapshot of the current state of the rangeMap and does not provide any guarantees about
	 * the order or grouping of the entries.
	 *
	 * @returns An array of RangeEntryResult objects, each containing the start index, length, and value of a contiguous range.
	 */
	public getAllEntries(): RangeQueryResult<T>[] {
		return this.entries;
	}

	/**
	 * Retrieves the value and length of the prefix with the same value for a given range.
	 *
	 * @param start - The start of the query range (inclusive).
	 * @param length - The length of the query range.
	 * @returns A RangeQueryResult describing the value and length of the matching prefix.
	 */
	public getFromRange(start: number, length: number): RangeQueryResult<T> {
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

		return { value: undefined, length };
	}

	/**
	 * Finds the first range entry intersecting a given range.
	 *
	 * @param start - The start of the query range (inclusive).
	 * @param length - The length of the query range.
	 * @returns The first intersecting RangeEntry or undefined if none exists.
	 */
	public getFirstEntryFromRange(
		start: number,
		length: number,
	): RangeQueryResult<T> | undefined {
		const lastQueryKey = start + length - 1;
		for (const entry of this.entries) {
			if (entry.start > lastQueryKey) {
				break;
			}

			const lastRangeKey = entry.start + entry.length - 1;
			if (lastRangeKey >= start) {
				return entry;
			}
		}

		return undefined;
	}

	/**
	 * Sets the value for a specified range, merging or splitting existing entries as needed.
	 *
	 * If value is undefined, the range is deleted.
	 *
	 * @param start - The start of the range to set (inclusive).
	 * @param length - The length of the range to set.
	 * @param value - The value to associate with the range or undefined to delete.
	 */
	public setInRange(start: number, length: number, value: T): void {
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
			this.deleteFromRange(start, length);
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
			this.entries.splice(iFirst, 1, { ...firstEntry, length: lengthBeforeFirst }, newEntry, {
				...lastEntry,
				start: end + 1,
				length: lengthAfterLast,
			});
			return;
		}

		if (lengthBeforeFirst > 0) {
			this.entries[iFirst] = { ...firstEntry, length: lengthBeforeFirst };

			iBefore = iFirst;
		}

		if (lengthAfterLast > 0) {
			this.entries[iLast] = {
				...lastEntry,
				start: end + 1,
				length: lengthAfterLast,
			};

			iAfter = iLast;
		}

		const numContainedEntries = iAfter - iBefore - 1;
		this.entries.splice(iBefore + 1, numContainedEntries, newEntry);
	}

	/**
	 * Deletes values within a specified range, updating or removing existing entries.
	 *
	 * @param start - The start of the range to delete (inclusive).
	 * @param length - The length of the range to delete.
	 */
	public deleteFromRange(start: number, length: number): void {
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
			return;
		}

		const iFirst = iBefore + 1;
		const iLast = iAfter - 1;

		for (let i = iFirst; i <= iLast; ++i) {
			const entry = this.entries[i] ?? oob();
			const entryLastKey = entry.start + entry.length - 1;
			let isDirty = false;

			if (entry.start >= start && entryLastKey <= end) {
				this.entries.splice(i, 1);
			} else {
				if (entry.start < start) {
					const lengthBefore = start - entry.start;
					this.entries[i] = { ...entry, length: lengthBefore };
					isDirty = true;
				}

				if (entryLastKey > end) {
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
 * A map keyed on integers allowing reading and writing contiguous ranges of integer keys.
 *
 * TODO: We should avoid the direct exposure of RangeEntry. AB#7414
 */

/**
 * Represents a contiguous range of values in the RangeMap.
 * This interface is used internally and should not be exposed to consumers.
 */
interface RangeEntry<T> {
	/**
	 * The starting index of the range (inclusive).
	 */
	start: number;

	/**
	 * The length of the range.
	 */
	length: number;

	/**
	 * The value associated with this range.
	 */
	value: T;
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

	/**
	 * The starting index of the matching range (optional).
	 * This field is only populated when the query range matches a contiguous range in the RangeMap.
	 */
	start?: number;
}
