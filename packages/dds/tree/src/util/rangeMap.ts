/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { BTree } from "@tylerbu/sorted-btree-es6";

/**
 * RangeMap represents a mapping from integers to values of type T or undefined.
 * The values for a range of consecutive keys can be changed or queried in a single operation.
 */
export class RangeMap<K, V> {
	private tree: BTree<K, RangeEntry<V>>;

	/**
	 * @param subtractKeys - Returns the distance from `b` to `a`.
	 * Can be infinite if `a` cannot be reached from `b` by offsetting,
	 * but the return value should still be positive if `a` is larger than `b` and negative if smaller.
	 */
	public constructor(
		private readonly offsetKey: (key: K, offset: number) => K,
		private readonly subtractKeys: (a: K, b: K) => number,
	) {
		this.tree = new BTree(undefined, subtractKeys);
	}

	/**
	 * Retrieves all entries from the RangeMap.
	 */
	public entries(): RangeQueryEntry<K, V>[] {
		const entries: RangeQueryEntry<K, V>[] = [];
		for (const [start, entry] of this.tree.entries()) {
			entries.push({ start, length: entry.length, value: entry.value });
		}

		return entries;
	}

	public clear(): void {
		this.tree.clear();
	}

	public get(start: K, length: number): RangeQueryEntry<K, V>[] {
		const result: RangeQueryEntry<K, V>[] = [];
		const lastQueryKey = this.offsetKey(start, length - 1);

		let nextKey = start;
		let remainingLength = length;
		{
			const entry = this.tree.getPairOrNextLower(start);
			if (entry !== undefined) {
				const [key, { length: entryLength, value }] = entry;
				const lastEntryKey = this.offsetKey(key, entryLength);
				if (this.ge(lastEntryKey, start)) {
					const overlappingLength = Math.min(
						this.subtractKeys(lastEntryKey, start) + 1,
						length,
					);

					result.push({ start, length: overlappingLength, value });
					nextKey = this.offsetKey(lastEntryKey, 1);
				}
			}
		}

		while (remainingLength > 0) {
			const entry = this.tree.getPairOrNextHigher(nextKey);
			if (entry === undefined) {
				break;
			}

			const [key, { length: entryLength, value }] = entry;
			const lastEntryKey = this.offsetKey(key, entryLength);
			if (this.gt(key, lastQueryKey)) {
				break;
			}
			const overlappingLength = Math.min(remainingLength, entryLength);
			result.push({ start: key, length: overlappingLength, value });
			nextKey = this.offsetKey(lastEntryKey, 1);
			remainingLength -= entryLength;
		}

		return result;
	}

	/**
	 * Retrieves the value for some prefix of the query range.
	 *
	 * @param start - The first key in the query range.
	 * @param length - The length of the query range.
	 * @returns A RangeQueryResult containing the value associated with `start`,
	 * and the number of consecutive keys with that same value.
	 */
	public getFirst(start: K, length: number): RangeQueryResult<K, V> {
		// We first check for an entry with a key less than or equal to `start`.
		{
			const entry = this.tree.getPairOrNextLower(start);
			if (entry !== undefined) {
				const entryKey = entry[0];
				const { value, length: entryLength } = entry[1];

				const entryLastKey = this.offsetKey(entryKey, entryLength - 1);
				const overlappingLength = Math.min(this.subtractKeys(entryLastKey, start) + 1, length);
				if (overlappingLength > 0) {
					return { value, start, length: overlappingLength };
				}
			}
		}

		{
			// There is no value associated with `start`.
			// Now we need to determine how many of the following keys are also undefined.
			const key = this.tree.nextHigherKey(start);
			if (key !== undefined) {
				const entryKey = key;

				const lastQueryKey = this.offsetKey(start, length - 1);
				if (this.le(entryKey, lastQueryKey)) {
					return { value: undefined, start, length: this.subtractKeys(entryKey, start) };
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
	public set(start: K, length: number, value: V | undefined): void {
		this.delete(start, length);
		if (value !== undefined) {
			this.tree.set(start, { value, length });
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
	public delete(start: K, length: number): void {
		const lastDeleteKey = this.offsetKey(start, length - 1);
		for (const { start: key, length: entryLength, value } of this.getIntersectingEntries(
			start,
			length,
		)) {
			this.tree.delete(key);
			const lengthBefore = this.subtractKeys(start, key);
			if (lengthBefore > 0) {
				// A portion of this entry comes before the deletion range, so we reinsert that portion.
				this.tree.set(key, { length: lengthBefore, value });
			}

			const lastEntryKey = this.offsetKey(key, entryLength - 1);
			const lengthAfter = this.subtractKeys(lastEntryKey, lastDeleteKey);
			if (lengthAfter > 0) {
				// A portion of this entry comes after the deletion range, so we reinsert that portion.
				this.tree.set(this.offsetKey(lastDeleteKey, 1), { length: lengthAfter, value });
			}
		}
	}

	public clone(): RangeMap<K, V> {
		const cloned = new RangeMap<K, V>(this.offsetKey, this.subtractKeys);
		cloned.tree = this.tree.clone();
		return cloned;
	}

	/**
	 * Returns a new map which contains the entries from both input tables.
	 */
	public static mergeMaps<K, V>(a: RangeMap<K, V>, b: RangeMap<K, V>): RangeMap<K, V> {
		assert(
			a.offsetKey === b.offsetKey && a.subtractKeys === b.subtractKeys,
			"Maps should have the same behavior",
		);

		const merged = new RangeMap<K, V>(a.offsetKey, a.subtractKeys);

		// TODO: Is there a good pattern that lets us make `tree` readonly?
		merged.tree = a.tree.clone();
		for (const [key, value] of b.tree.entries()) {
			// TODO: Handle key collisions
			merged.tree.set(key, value);
		}

		return merged;
	}

	private getIntersectingEntries(start: K, length: number): RangeQueryEntry<K, V>[] {
		const entries: RangeQueryEntry<K, V>[] = [];
		const lastQueryKey = this.offsetKey(start, length - 1);
		{
			const entry = this.tree.getPairOrNextLower(start);
			if (entry !== undefined) {
				const key = entry[0];
				const { length: entryLength, value } = entry[1];
				const lastEntryKey = this.offsetKey(key, entryLength - 1);
				if (this.ge(lastEntryKey, start)) {
					entries.push({ start: key, length: entryLength, value });
				}
			}
		}

		{
			let entry = this.tree.nextHigherPair(start);
			while (entry !== undefined) {
				const key = entry[0];
				if (this.gt(key, lastQueryKey)) {
					break;
				}

				const { length: entryLength, value } = entry[1];
				const lastEntryKey = this.offsetKey(key, entryLength - 1);

				entries.push({ start: key, length: entryLength, value });
				entry = this.tree.nextHigherPair(lastEntryKey);
			}
		}

		return entries;
	}

	private gt(a: K, b: K): boolean {
		return this.subtractKeys(a, b) > 0;
	}

	private ge(a: K, b: K): boolean {
		return this.subtractKeys(a, b) >= 0;
	}

	private lt(a: K, b: K): boolean {
		return this.subtractKeys(a, b) < 0;
	}

	private le(a: K, b: K): boolean {
		return this.subtractKeys(a, b) <= 0;
	}
}

/**
 * Represents a contiguous range of values in the RangeMap.
 */
interface RangeEntry<V> {
	/**
	 * The length of the range.
	 */
	readonly length: number;

	/**
	 * The value associated with this range.
	 */
	readonly value: V;
}

/**
 * Describes the result of a range query, including the value and length of the matching prefix.
 */
export interface RangeQueryResult<K, V> {
	/**
	 * The key for the first element in the range.
	 */
	readonly start: K;

	/**
	 * The value of the first key in the query range.
	 * If no matching range is found, this will be undefined.
	 */
	readonly value: V | undefined;

	/**
	 * The length of the prefix of the query range which has the same value.
	 * For example, if a RangeMap has the same value for keys 5, 6, and 7,
	 * a query about the range [5, 10] would give a result with length 3.
	 */
	readonly length: number;
}

export interface RangeQueryEntry<K, V> extends RangeQueryResult<K, V> {
	readonly value: V;
}

export function newIntegerRangeMap<V>(): RangeMap<number, V> {
	return new RangeMap(offsetInteger, subtractIntegers);
}

function offsetInteger(key: number, offset: number): number {
	return key + offset;
}

function subtractIntegers(a: number, b: number): number {
	return a - b;
}
