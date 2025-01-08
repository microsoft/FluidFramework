/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { newTupleBTree, type TupleBTree } from "./bTreeUtils.js";

/**
 * RangeMap represents a mapping from integers to values of type T or undefined.
 * The values for a range of consecutive keys can be changed or queried in a single operation.
 */
export class RangeMap<T> {
	private readonly tree: TupleBTree<[number], RangeEntry<T>>;

	public constructor() {
		this.tree = newTupleBTree();
	}

	/**
	 * Retrieves all entries from the RangeMap.
	 */
	public getAllEntries(): RangeQueryResult<T>[] {
		const entries: RangeQueryResult<T>[] = [];
		for (const [[start], entry] of this.tree.entries()) {
			entries.push({ start, length: entry.length, value: entry.value });
		}

		return entries;
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
		// We first check for an entry with a key less than or equal to `start`.
		{
			const entry = this.tree.getPairOrNextLower([start]);
			if (entry !== undefined) {
				const [entryKey] = entry[0];
				const { value, length: entryLength } = entry[1];

				const entryLastId = entryKey + entryLength - 1;
				const overlappingLength = Math.min(entryLastId - start + 1, length);
				if (overlappingLength > 0) {
					return { value, start, length: overlappingLength };
				}
			}
		}

		{
			// There is no value associated with `start`.
			// Now we need to determine how many of the following keys are also undefined.
			const key = this.tree.nextHigherKey([start]);
			if (key !== undefined) {
				const [entryKey] = key;

				const lastQueryId = start + length - 1;
				if (entryKey <= lastQueryId) {
					return { value: undefined, start, length: entryKey - start };
				}
			}

			return { value: undefined, start, length };
		}
	}

	/**
	 * Sets the value for a specified range.
	 *
	 * @param start - The first key in the range being set.
	 * @param length - The length of the range.
	 * @param value - The value to associate with the range.
	 */
	public set(start: number, length: number, value: T | undefined): void {
		this.delete(start, length);
		if (value !== undefined) {
			this.tree.set([start], { value, length });
		}
	}

	/**
	 * Deletes values within a specified range, updating or removing existing entries.
	 *
	 * 1. If an entry is completely included in the deletion range, the whole entry will be deleted
	 * e.g.: map = [[1, 2], [4, 6]], delete range: [3, 6]
	 * map becomes [[1, 2]] after deletion
	 * (Note: the notation [a, b] represents start = a, end = b for simpler visualization, instead of `b`
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
		const lastDeletedKey = start + length - 1;
		{
			const entry = this.tree.getPairOrNextLower([start]);
			if (entry !== undefined) {
				const [key] = entry[0];
				const { length: entryLength, value } = entry[1];
				const lastEntryKey = key + entryLength - 1;
				if (lastEntryKey >= start) {
					// This entry overlaps with the deleted range, so we remove it.
					this.tree.delete([key]);
					if (key < start) {
						// A portion of the entry comes before the delete range, so we reinsert that portion.
						this.tree.set([key], { value, length: start - key });
					}

					if (lastEntryKey > lastDeletedKey) {
						// A portion of the entry comes after the delete range, so we reinsert that portion.
						this.tree.set([lastDeletedKey + 1], {
							value,
							length: lastEntryKey - lastDeletedKey,
						});

						return;
					}
				}
			}
		}

		{
			let entry = this.tree.nextHigherPair([start]);
			while (entry !== undefined) {
				const [key] = entry[0];
				if (key > lastDeletedKey) {
					return;
				}

				const { length: entryLength, value } = entry[1];
				const lastEntryKey = key + entryLength - 1;

				this.tree.delete([key]);
				if (lastEntryKey > lastDeletedKey) {
					// A portion of the entry comes after the delete range, so we reinsert that portion.
					this.tree.set([lastDeletedKey + 1], {
						value,
						length: lastEntryKey - lastDeletedKey,
					});

					return;
				}

				entry = this.tree.nextHigherPair([lastEntryKey]);
			}
		}
	}
}

/**
 * Represents a contiguous range of values in the RangeMap.
 */
interface RangeEntry<T> {
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
	readonly start: number;

	/**
	 * The key for the first element in the range.
	 */
	readonly start: number;

	/**
	 * The value of the first key in the query range.
	 * If no matching range is found, this will be undefined.
	 */
	readonly value: T | undefined;

	/**
	 * The length of the prefix of the query range which has the same value.
	 * For example, if a RangeMap has the same value for keys 5, 6, and 7,
	 * a query about the range [5, 10] would give a result with length 3.
	 */
	readonly length: number;
}
