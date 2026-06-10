/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/core-utils/internal";
import { BTree } from "@tylerbu/sorted-btree-es6";
// eslint-disable-next-line import-x/no-internal-modules
import { union } from "@tylerbu/sorted-btree-es6/extended/union";

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
	 * `RangeQueryResult` or `RangeMapEntry`.
	 *
	 * If `offsetValue` is left unspecified, all keys in a block will be given the same value.
	 */
	public constructor(
		public readonly offsetKey: (key: K, offset: number) => K,
		public readonly subtractKeys: (a: K, b: K) => number,
		public readonly offsetValue: (value: V, offset: number) => V = defaultValueOffsetFn,
	) {
		this.tree = new BTree(undefined, subtractKeys);
	}

	/**
	 * Retrieves all entries from the RangeMap.
	 */
	public entries(): RangeMapEntry<K, V>[] {
		const entries: RangeMapEntry<K, V>[] = [];
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
	 * @param length - The length of the query range
	 * @returns A list of fragments, each describing the value for a subrange of the query.
	 * The fragments are in the same order as the keys.
	 * The key for each fragment is `start` offset by `fragment.offset`.
	 */
	public getAll(start: K, length: number): RangeQueryResultFragment<V | undefined>[] {
		let offset = 0;
		const results: RangeQueryResultFragment<V | undefined>[] = [];

		while (offset < length) {
			const key = this.offsetKey(start, offset);
			const result = this.getFirst(key, length - offset);
			results.push({ offset, value: result.value, length: result.length });
			offset += result.length;
		}

		return results;
	}

	/**
	 * Retrieves the value for some prefix of the query range.
	 *
	 * @param start - The first key in the query range.
	 * @param length - The length of the query range.
	 * @returns A RangeQueryResult containing the value associated with `start`,
	 * and the number of consecutive keys with that same value (at least 1, at most `length`).
	 */
	public getFirst(start: K, length: number): RangeQueryResult<V | undefined> {
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
					return { value: undefined, length: this.subtractKeys(entryKey, start) };
				}
			}

			return { value: undefined, length };
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
	 * @returns The number of keys/value pairs deleted (integer between 0 and `length`, inclusive).
	 */
	public delete(start: K, length: number): number {
		let deleteCount = 0;
		const lastDeleteKey = this.offsetKey(start, length - 1);
		for (const { start: key, length: entryLength, value } of this.getIntersectingEntries(
			start,
			length,
		)) {
			deleteCount += entryLength;
			this.tree.delete(key);
			const lengthBefore = this.subtractKeys(start, key);
			if (lengthBefore > 0) {
				// A portion of this entry comes before the deletion range, so we reinsert that portion.
				this.tree.set(key, { length: lengthBefore, value });
				deleteCount -= lengthBefore;
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
				deleteCount -= lengthAfter;
			}
		}
		return deleteCount;
	}

	public clone(): RangeMap<K, V> {
		const cloned = new RangeMap<K, V>(this.offsetKey, this.subtractKeys, this.offsetValue);
		cloned.tree = this.tree.clone();
		return cloned;
	}

	/**
	 * Returns a new map which contains the entries from both input maps.
	 * Whenever both maps contain entries for the same keys, the value is determined by calling `mergeFunc`.
	 * By default, `mergeFunc` chooses the value from `b`.
	 */
	public static union<K, V>(
		a: RangeMap<K, V>,
		b: RangeMap<K, V>,
		mergeFunc: (key: K, valueA: V, valueB: V) => V = (_k, _a, valB) => valB,
	): RangeMap<K, V> {
		assert(
			a.offsetKey === b.offsetKey &&
				a.subtractKeys === b.subtractKeys &&
				a.offsetValue === b.offsetValue,
			0xaae /* Maps should have the same behavior */,
		);

		const merged = new RangeMap<K, V>(a.offsetKey, a.subtractKeys, a.offsetValue);

		// We first union the underlying B-trees, possibly resulting in a malformed range map.
		merged.tree = union<BTree<K, RangeEntry<V>>, K, RangeEntry<V>>(
			a.tree,
			b.tree,
			(key, v1, v2) => v1,
		);

		// We split the overlapping tree entries into ranges which are either fully overlapping (intersections),
		// or fully non-overlapping (residuals).
		// We create an entry for each of these ranges.
		// After this, the merged map should be well-formed.
		RangeMap.forEachIntersection(
			a,
			b,
			(key, length, valueA, valueB) =>
				merged.tree.set(key, { value: mergeFunc(key, valueA, valueB), length }),
			(key, length, value) => merged.tree.set(key, { value, length }),
		);

		return merged;
	}

	/**
	 * Calls provided handlers on intersecting portions of `mapA` and `mapB`.
	 * @param intersectionCallback - called once for each key which has an entry in both `mapA` and `mapB`.
	 * @param residualCallback - called for each key which only has an entry in one of the input maps,
	 * but which is part of a range entry that overlaps an entry in the other map.
	 * This may also be called for entries which are not part of an overlapping range.
	 */
	private static forEachIntersection<K, V>(
		mapA: RangeMap<K, V>,
		mapB: RangeMap<K, V>,
		intersectionCallback: (key: K, length: number, valueA: V, valueB: V) => void,
		residualCallback: (key: K, length: number, value: V) => void,
	): void {
		let [entry1, map1, map2] = this.getOrNextEntry(mapA, mapB, undefined);
		while (entry1 !== undefined) {
			const entry2 = map2.getOrNextEntry(entry1.start);
			if (entry2 !== undefined) {
				// This is the number of keys in `entry1` that come before the first key in `entry2`.
				const offset = Math.min(mapA.subtractKeys(entry2.start, entry1.start), entry1.length);
				if (offset > 0) {
					residualCallback(entry1.start, offset, entry1.value);
				}

				const intersectionLength = Math.min(entry1.length - offset, entry2.length);
				if (intersectionLength > 0) {
					const value1Offset = mapA.offsetValue(entry1.value, offset);
					const [valueA, valueB] =
						map1 === mapA ? [value1Offset, entry2.value] : [entry2.value, value1Offset];

					intersectionCallback(entry2.start, intersectionLength, valueA, valueB);
					[entry1, map1, map2] = this.getOrNextEntry(
						mapA,
						mapB,
						mapA.offsetKey(entry2.start, intersectionLength),
					);
					continue;
				}
			}

			residualCallback(entry1.start, entry1.length, entry1.value);
			[entry1, map1, map2] = this.getOrNextEntry(
				mapA,
				mapB,
				mapA.offsetKey(entry1.start, entry1.length),
			);
		}

		return;
	}

	private static getOrNextEntry<K, V>(
		mapA: RangeMap<K, V>,
		mapB: RangeMap<K, V>,
		key: K | undefined,
	): [RangeMapEntry<K, V> | undefined, firstMap: RangeMap<K, V>, secondMap: RangeMap<K, V>] {
		const entryA = mapA.getOrNextEntry(key);
		const entryB = mapB.getOrNextEntry(key);
		if (entryA === undefined) {
			return [entryB, mapB, mapA];
		} else if (entryB === undefined) {
			return [entryA, mapA, mapB];
		}

		return mapA.le(entryA.start, entryB.start) ? [entryA, mapA, mapB] : [entryB, mapB, mapA];
	}

	/**
	 * @returns a range entry representing the first defined key range greater than or equal to `key`.
	 */
	private getOrNextEntry(minKey: K | undefined): RangeMapEntry<K, V> | undefined {
		const key = minKey ?? this.tree.minKey();
		if (key === undefined) {
			return undefined;
		}

		const result = this.getFirst(key, Infinity);
		if (result.value !== undefined) {
			return { start: key, value: result.value, length: result.length };
		}

		const entry = this.tree.nextHigherPair(key);
		if (entry === undefined) {
			return undefined;
		}

		return { start: entry[0], value: entry[1].value, length: entry[1].length };
	}

	private getIntersectingEntries(start: K, length: number): RangeMapEntry<K, V>[] {
		const entries: RangeMapEntry<K, V>[] = [];
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
export interface RangeQueryResult<V> {
	/**
	 * The value of the first key in the query range.
	 */
	readonly value: V;

	/**
	 * The length of the prefix of the query range which has the same value.
	 * For example, if a RangeMap has the same value for keys 5, 6, and 7,
	 * a query about the range [5, 10] would give a result with length 3.
	 */
	readonly length: number;
}

export interface RangeQueryResultFragment<V> extends RangeQueryResult<V> {
	/**
	 * The offset from the query key to the key this result is associated with.
	 * This is useful in the case where a query returns multiple `RangeQueryResults`
	 * addressing the key range.
	 */
	readonly offset: number;
}

export interface RangeMapEntry<K, V> {
	readonly start: K;
	readonly value: V;
	readonly length: number;
}

export function newIntegerRangeMap<V, K extends number = number>(): RangeMap<K, V> {
	return new RangeMap(offsetInteger, subtractIntegers);
}

function offsetInteger<K extends number>(key: K, offset: number): K {
	return (key + offset) as K;
}

function subtractIntegers<K extends number>(a: K, b: K): number {
	return a - b;
}

function defaultValueOffsetFn<T>(value: T, offset: number): T {
	return value;
}
