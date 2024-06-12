/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable tsdoc/syntax */
/* eslint-disable no-bitwise */
import { assert } from "@fluidframework/core-utils/internal";

/**
 * A map in which entries are always added in key-sorted order.
 * Supports appending and searching.
 */
export class AppendOnlySortedMap<TKey, TValue> {
	protected readonly elements: (TKey | TValue)[] = [];

	/**
	 * @param comparator - a comparator for keys
	 */
	public constructor(protected readonly comparator: (a: TKey, b: TKey) => number) {}

	/**
	 * @returns the number of entries in this map
	 */
	public get size(): number {
		return this.elements.length / 2;
	}

	/**
	 * @returns the min key in the map.
	 */
	public minKey(): TKey | undefined {
		return this.elements[0] as TKey | undefined;
	}

	/**
	 * @returns the max key in the map.
	 */
	public maxKey(): TKey | undefined {
		return this.elements[this.elements.length - 2] as TKey | undefined;
	}

	/**
	 * @returns the min value in the map.
	 */
	public minValue(): TValue | undefined {
		return this.elements[1] as TValue | undefined;
	}

	/**
	 * @returns the min value in the map.
	 */
	public maxValue(): TValue | undefined {
		return this.elements[this.elements.length - 1] as TValue | undefined;
	}

	/**
	 * @returns the min key in the map.
	 */
	public first(): [TKey, TValue] | undefined {
		const { elements } = this;
		const { length } = elements;
		if (length === 0) {
			return undefined;
		}
		return [elements[0] as TKey, elements[1] as TValue];
	}

	/**
	 * @returns the max key in the map.
	 */
	public last(): [TKey, TValue] | undefined {
		const { elements } = this;
		const { length } = elements;
		if (length === 0) {
			return undefined;
		}
		const lastKeyIndex = length - 2;
		return [elements[lastKeyIndex] as TKey, elements[lastKeyIndex + 1] as TValue];
	}

	/**
	 * Returns the element at the insertion index.
	 */
	public getAtIndex(index: number): [TKey, TValue] | undefined {
		const realIndex = index * 2;
		const { elements } = this;
		if (realIndex < 0 || realIndex > elements.length - 1) {
			return undefined;
		}
		return [elements[realIndex] as TKey, elements[realIndex + 1] as TValue];
	}

	/**
	 * @returns an iterable of the entries in the map.
	 */
	public *entries(): IterableIterator<readonly [TKey, TValue]> {
		const { elements } = this;
		for (let i = 0; i < elements.length; i += 2) {
			yield [elements[i] as TKey, elements[i + 1] as TValue];
		}
	}

	/**
	 * @returns an iterable of the keys in the map.
	 */
	public *keys(): IterableIterator<TKey> {
		const { elements } = this;
		for (let i = 0; i < elements.length; i += 2) {
			yield elements[i] as TKey;
		}
	}

	/**
	 * @returns an iterable of the values in the map.
	 */
	public *values(): IterableIterator<TValue> {
		const { elements } = this;
		for (let i = 0; i < elements.length; i += 2) {
			yield elements[i + 1] as TValue;
		}
	}

	/**
	 * @returns an iterable of the entries in the map, reversed.
	 */
	public *entriesReversed(): IterableIterator<readonly [TKey, TValue]> {
		const { elements } = this;
		for (let i = elements.length - 2; i >= 0; i -= 2) {
			yield [elements[i] as TKey, elements[i + 1] as TValue];
		}
	}

	/**
	 * Adds a new key/value pair to the map. `key` must be > to all keys in the map.
	 * @param key - the key to add.
	 * @param value - the value to add.
	 */
	public append(key: TKey, value: TValue): void {
		const { elements } = this;
		const { length } = elements;
		if (length !== 0 && this.comparator(key, this.maxKey() as TKey) <= 0) {
			throw new Error("Inserted key must be > all others in the map.");
		}
		elements.push(key);
		elements.push(value);
	}

	/**
	 * Replaces the last key/value pair with the given one. If the map is empty, it simply appends.
	 * `key` must be > to all keys in the map prior to the one replaced.
	 * @param key - the key to add.
	 * @param value - the value to add.
	 */
	public replaceLast(key: TKey, value: TValue): void {
		const { elements, comparator } = this;
		const { length } = elements;
		if (length !== 0) {
			elements.pop();
			elements.pop();
			if (comparator(key, this.maxKey() as TKey) <= 0) {
				throw new Error("Inserted key must be > all others in the map.");
			}
		}
		elements.push(key);
		elements.push(value);
	}

	/**
	 * @param key - the key to lookup.
	 * @returns the value associated with `key` if such an entry exists, and undefined otherwise.
	 */
	public get(key: TKey): TValue | undefined {
		const index = AppendOnlySortedMap.keyIndexOf(this.elements, key, this.comparator);
		if (index < 0) {
			return undefined;
		}
		return this.elements[index + 1] as TValue;
	}

	/**
	 * @param key - the key to lookup.
	 * @returns the entry associated with `key` if such an entry exists, the entry associated with the next lower key if such an entry
	 * exists, and undefined otherwise.
	 */
	public getPairOrNextLower(key: TKey): readonly [TKey, TValue] | undefined {
		return this.getPairOrNextLowerBy(key, this.comparator);
	}

	/**
	 * @param key - the key to lookup.
	 * @returns the entry associated with `key` if such an entry exists, the entry associated with the next higher key if such an entry
	 * exists, and undefined otherwise.
	 */
	public getPairOrNextHigher(key: TKey): readonly [TKey, TValue] | undefined {
		return this.getPairOrNextHigherBy(key, this.comparator);
	}

	/**
	 * Compares two `AppendOnlySortedMap`s.
	 */
	public equals(
		other: AppendOnlySortedMap<TKey, TValue>,
		compareValues: (a: TValue, b: TValue) => boolean,
	): boolean {
		if (other === this) {
			return true;
		}

		if (this.elements.length !== other.elements.length) {
			return false;
		}

		for (let i = this.elements.length - 2; i >= 0; i -= 2) {
			const keyThis = this.elements[i] as TKey;
			const valueThis = this.elements[i + 1] as TValue;
			const keyOther = other.elements[i] as TKey;
			const valueOther = other.elements[i + 1] as TValue;
			if (this.comparator(keyThis, keyOther) !== 0) {
				return false;
			}
			if (!compareValues(valueThis, valueOther)) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Test-only expensive assertions to check the internal validity of the data structure.
	 */
	public assertValid(): void {
		let prev: readonly [TKey, unknown] | undefined;
		for (const kv of this.entries()) {
			if (prev !== undefined) {
				assert(
					this.comparator(kv[0], prev[0]) > 0,
					0x752 /* Keys in map must be sorted. */,
				);
			}
			prev = kv;
		}
	}

	/**
	 * Queries a range of entries.
	 * @param from - the key to start the range query at, inclusive.
	 * @param to - the key to end the range query at, inclusive.
	 * @returns the range of entries.
	 */
	public *getRange(from: TKey, to: TKey): IterableIterator<readonly [TKey, TValue]> {
		const keyIndexFrom = this.getKeyIndexOfOrNextHigher(from, this.comparator);
		if (keyIndexFrom === undefined) {
			return;
		}

		const keyIndexTo = this.getKeyIndexOfOrNextLower(to, this.comparator);
		if (keyIndexTo === undefined) {
			return;
		}

		for (let i = keyIndexFrom; i <= keyIndexTo; i += 2) {
			yield [this.elements[i] as TKey, this.elements[i + 1] as TValue];
		}
	}

	protected getPairOrNextLowerBy<T>(
		search: T,
		comparator: (search: T, key: TKey, value: TValue) => number,
	): readonly [TKey, TValue] | undefined {
		const keyIndex = this.getKeyIndexOfOrNextLower(search, comparator);
		if (keyIndex === undefined) {
			return undefined;
		}

		return [this.elements[keyIndex] as TKey, this.elements[keyIndex + 1] as TValue];
	}

	private getKeyIndexOfOrNextLower<T>(
		search: T,
		comparator: (search: T, key: TKey, value: TValue) => number,
	): number | undefined {
		const { elements } = this;
		if (elements.length === 0) {
			return undefined;
		}
		let keyIndex = AppendOnlySortedMap.keyIndexOf(elements, search, comparator);
		if (keyIndex < 0) {
			keyIndex ^= AppendOnlySortedMap.failureXor;
			if (keyIndex > 0) {
				return keyIndex - 2;
			}
			return undefined;
		}
		return keyIndex;
	}

	protected getPairOrNextHigherBy<T>(
		search: T,
		comparator: (search: T, key: TKey, value: TValue) => number,
	): readonly [TKey, TValue] | undefined {
		const keyIndex = this.getKeyIndexOfOrNextHigher(search, comparator);
		if (keyIndex === undefined) {
			return undefined;
		}

		return [this.elements[keyIndex] as TKey, this.elements[keyIndex + 1] as TValue];
	}

	private getKeyIndexOfOrNextHigher<T>(
		search: T,
		comparator: (search: T, key: TKey, value: TValue) => number,
	): number | undefined {
		const { elements } = this;
		const { length } = elements;
		if (length === 0) {
			return undefined;
		}
		let keyIndex = AppendOnlySortedMap.keyIndexOf(elements, search, comparator);
		if (keyIndex < 0) {
			keyIndex ^= AppendOnlySortedMap.failureXor;
			if (keyIndex < length) {
				return keyIndex;
			}
			return undefined;
		}
		return keyIndex;
	}

	/**
	 * The value xor'd with the result index when a search fails.
	 */
	public static readonly failureXor = -1;

	/**
	 * Performs a binary search on the sorted array.
	 * @returns the index of the key for `search`, or (if not present) the index it would have been inserted into xor'd
	 * with `failureXor`. Note that negating is not an adequate solution as that could result in -0.
	 */
	public static keyIndexOf<TSearch, TKey, TValue>(
		elements: readonly (TKey | TValue)[],
		search: TSearch,
		comparator: (search: TSearch, key: TKey, value: TValue) => number,
	): number {
		// Low, high, and mid are addresses of [K,V] pairs and *not* key indices
		let low = 0;
		let high = elements.length / 2;
		let mid = high >> 1;
		while (low < high) {
			const keyIndex = mid * 2;
			const c = comparator(
				search,
				elements[keyIndex] as TKey,
				elements[keyIndex + 1] as TValue,
			);
			if (c > 0) {
				low = mid + 1;
			} else if (c < 0) {
				high = mid;
			} else if (c === 0) {
				return keyIndex;
			} else {
				throw new Error("Invalid comparator.");
			}
			mid = (low + high) >> 1;
		}
		return (mid * 2) ^ AppendOnlySortedMap.failureXor;
	}
}
