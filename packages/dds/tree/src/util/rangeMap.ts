/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, oob } from "@fluidframework/core-utils/internal";
import { BTree } from "@tylerbu/sorted-btree-es6";

/**
 * RangeMap represents a mapping from keys of type K to values of type V or undefined.
 * The set of all possible keys is assumed to be fully ordered,
 * and for each key there should be a single next higher key.
 * The values for a range of consecutive keys can be changed or queried in a single operation.
 * The structure of the keys is described by the `offsetKey` and `subtractKeys` functions provided in the constructor.
 */
export class RangeMap<K, V> {
	private tree: BTree<K, RangeEntry<V>>;

	/**
	 * @param offsetKey - Function which returns a new key which is `offset` keys after `key`.
	 * When `offset` is negative, the returned key should come before `key`.
	 *
	 * @param subtractKeys - Function which returns the difference between `b` and `a`.
	 * Offsetting `b` by this difference should return `a`.
	 * The difference can be infinite if `a` cannot be reached from `b` by offsetting,
	 * but the difference should still be positive if `a` is larger than `b` and negative if smaller.
	 *
	 * @param offsetValue - Function used to associate a range of values with a range of keys.
	 * When writing to a range of keys starting with `start`, the value of the nth key is interpreted to be
	 * `offsetValue(firstValue, n - 1)`.
	 * The same logic should be used when interpreting the values for keys after the first in a
	 * `RangeQueryResult` or `RangeQueryEntry`.
	 *
	 * If `offsetValue` is left unspecified, all keys in a block will be given the same value.
	 */
	public constructor(
		private readonly offsetKey: (key: K, offset: number) => K,
		private readonly subtractKeys: (a: K, b: K) => number,
		public readonly offsetValue: (value: V, offset: number) => V = defaultValueOffsetFn,
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

	/**
	 * Retrieves the values for all keys in the query range.
	 *
	 * @param start - The first key in the range being queried
	 * @param length  - The length of the query range
	 * @returns A list of entries, each describing the value for some subrange of the query.
	 * The entries are in the same order as the keys, and there is an entry for every key with a non `undefined` value.
	 */
	public getAll(start: K, length: number): RangeQueryEntry<K, V>[] {
		const entries = this.getIntersectingEntries(start, length);
		if (entries.length === 0) {
			return entries;
		}

		const firstEntry = entries[0] ?? oob();
		const lengthBefore = this.subtractKeys(start, firstEntry.start);
		if (lengthBefore > 0) {
			entries[0] = {
				start,
				length: firstEntry.length - lengthBefore,
				value: this.offsetValue(firstEntry.value, lengthBefore),
			};
		}

		const lastEntry = entries[entries.length - 1] ?? oob();
		const lastEntryKey = this.offsetKey(lastEntry.start, lastEntry.length - 1);
		const lastQueryKey = this.offsetKey(start, length - 1);
		const lengthAfter = this.subtractKeys(lastEntryKey, lastQueryKey);
		if (lengthAfter > 0) {
			entries[entries.length - 1] = { ...lastEntry, length: lastEntry.length - lengthAfter };
		}

		return entries;
	}

	public getAll2(start: K, length: number): RangeQueryResult<K, V>[] {
		let nextKey = start;
		let lengthRemaining = length;
		const result: RangeQueryResult<K, V>[] = [];
		for (const entry of this.getAll(start, length)) {
			const lengthBefore = this.subtractKeys(entry.start, nextKey);
			if (lengthBefore > 0) {
				result.push({ start: nextKey, length: lengthBefore, value: undefined });
				lengthRemaining -= lengthBefore;
			}

			result.push(entry);
			nextKey = this.offsetKey(entry.start, entry.length);
			lengthRemaining -= entry.length;
		}

		if (lengthRemaining > 0) {
			result.push({ start: nextKey, length: lengthRemaining, value: undefined });
		}

		return result;
	}

	/**
	 * Retrieves the value for some prefix of the query range.
	 *
	 * @param start - The first key in the query range.
	 * @param length - The length of the query range.
	 * @returns A RangeQueryResult containing the value associated with `start`,
	 * and the number of consecutive keys with that same value (at least 1, at most `length`).
	 */
	public getFirst(start: K, length: number): RangeQueryResult<K, V> {
		{
			// We first check for an entry with a key less than or equal to `start`.
			const entry = this.tree.getPairOrNextLower(start);
			if (entry !== undefined) {
				const entryKey = entry[0];
				const { value, length: entryLength } = entry[1];

				const entryLastKey = this.offsetKey(entryKey, entryLength - 1);
				const lengthBeforeQuery = this.subtractKeys(start, entryKey);
				const overlappingLength = Math.min(this.subtractKeys(entryLastKey, start) + 1, length);
				if (overlappingLength > 0) {
					return {
						value: this.offsetValue(value, lengthBeforeQuery),
						start,
						length: overlappingLength,
					};
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
				const newKey = this.offsetKey(lastDeleteKey, 1);
				const difference = this.subtractKeys(newKey, key);
				this.tree.set(newKey, {
					length: lengthAfter,
					value: this.offsetValue(value, difference),
				});
			}
		}
	}

	public clone(): RangeMap<K, V> {
		const cloned = new RangeMap<K, V>(this.offsetKey, this.subtractKeys, this.offsetValue);
		cloned.tree = this.tree.clone();
		return cloned;
	}

	public mapEntries(mapKey: (key: K) => K, mapValue: (value: V) => V): RangeMap<K, V> {
		const result = new RangeMap<K, V>(this.offsetKey, this.subtractKeys, this.offsetValue);
		for (const entry of this.entries()) {
			result.set(mapKey(entry.start), entry.length, mapValue(entry.value));
		}
		return result;
	}

	/**
	 * Returns a new map which contains the entries from both input maps.
	 */
	public static union<K, V>(a: RangeMap<K, V>, b: RangeMap<K, V>): RangeMap<K, V> {
		assert(
			a.offsetKey === b.offsetKey &&
				a.subtractKeys === b.subtractKeys &&
				a.offsetValue === b.offsetValue,
			0xaae /* Maps should have the same behavior */,
		);

		const merged = new RangeMap<K, V>(a.offsetKey, a.subtractKeys, a.offsetValue);

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

function defaultValueOffsetFn<T>(value: T, offset: number): T {
	return value;
}
