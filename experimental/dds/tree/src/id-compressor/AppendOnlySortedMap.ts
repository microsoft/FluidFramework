/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { assert, fail } from '../Common';

/**
 * A map in which entries are always added in key-sorted order.
 * Supports appending and searching.
 */
export class AppendOnlySortedMap<K, V> {
	protected readonly elements: (K | V)[] = [];

	/**
	 * @param comparator - a comparator for keys
	 */
	public constructor(protected readonly comparator: (a: K, b: K) => number) {}

	/**
	 * @returns the number of entries in this map
	 */
	public get size(): number {
		return this.elements.length / 2;
	}

	/**
	 * @returns the min key in the map.
	 */
	public minKey(): K | undefined {
		return this.elements[0] as K | undefined;
	}

	/**
	 * @returns the max key in the map.
	 */
	public maxKey(): K | undefined {
		return this.elements[this.elements.length - 2] as K | undefined;
	}

	/**
	 * @returns the min value in the map.
	 */
	public minValue(): V | undefined {
		return this.elements[1] as V | undefined;
	}

	/**
	 * @returns the min value in the map.
	 */
	public maxValue(): V | undefined {
		return this.elements[this.elements.length - 1] as V | undefined;
	}

	/**
	 * @returns the min key in the map.
	 */
	public first(): [K, V] | undefined {
		const { elements } = this;
		const { length } = elements;
		if (length === 0) {
			return undefined;
		}
		return [elements[0] as K, elements[1] as V];
	}

	/**
	 * @returns the max key in the map.
	 */
	public last(): [K, V] | undefined {
		const { elements } = this;
		const { length } = elements;
		if (length === 0) {
			return undefined;
		}
		const lastKeyIndex = length - 2;
		return [elements[lastKeyIndex] as K, elements[lastKeyIndex + 1] as V];
	}

	/**
	 * Returns the element at the insertion index.
	 */
	public getAtIndex(index: number): [K, V] | undefined {
		const realIndex = index * 2;
		const { elements } = this;
		if (realIndex < 0 || realIndex > elements.length - 1) {
			return undefined;
		}
		return [elements[realIndex] as K, elements[realIndex + 1] as V];
	}

	/**
	 * @returns an iterable of the entries in the map.
	 */
	public *entries(): IterableIterator<readonly [K, V]> {
		const { elements } = this;
		for (let i = 0; i < elements.length; i += 2) {
			yield [elements[i] as K, elements[i + 1] as V];
		}
	}

	/**
	 * @returns an iterable of the keys in the map.
	 */
	public *keys(): IterableIterator<K> {
		const { elements } = this;
		for (let i = 0; i < elements.length; i += 2) {
			yield elements[i] as K;
		}
	}

	/**
	 * @returns an iterable of the values in the map.
	 */
	public *values(): IterableIterator<V> {
		const { elements } = this;
		for (let i = 0; i < elements.length; i += 2) {
			yield elements[i + 1] as V;
		}
	}

	/**
	 * @returns an iterable of the entries in the map, reversed.
	 */
	public *entriesReversed(): IterableIterator<readonly [K, V]> {
		const { elements } = this;
		for (let i = elements.length - 2; i >= 0; i -= 2) {
			yield [elements[i] as K, elements[i + 1] as V];
		}
	}

	/**
	 * Adds a new key/value pair to the map. `key` must be \> to all keys in the map.
	 * @param key - the key to add.
	 * @param value - the value to add.
	 */
	public append(key: K, value: V): void {
		const { elements } = this;
		const { length } = elements;
		if (length !== 0 && this.comparator(key, this.maxKey() as K) <= 0) {
			fail('Inserted key must be > all others in the map.');
		}
		elements.push(key);
		elements.push(value);
	}

	/**
	 * @param key - the key to lookup.
	 * @returns the value associated with `key` if such an entry exists, and undefined otherwise.
	 */
	public get(key: K): V | undefined {
		const index = AppendOnlySortedMap.keyIndexOf(this.elements, key, this.comparator);
		if (index < 0) {
			return undefined;
		}
		return this.elements[index + 1] as V;
	}

	/**
	 * @param key - the key to lookup.
	 * @returns the entry associated with `key` if such an entry exists, the entry associated with the next lower key if such an entry
	 * exists, and undefined otherwise.
	 */
	public getPairOrNextLower(key: K): readonly [K, V] | undefined {
		return this.getPairOrNextLowerBy(key, this.comparator);
	}

	/**
	 * @param key - the key to lookup.
	 * @returns the entry associated with `key` if such an entry exists, the entry associated with the next higher key if such an entry
	 * exists, and undefined otherwise.
	 */
	public getPairOrNextHigher(key: K): readonly [K, V] | undefined {
		return this.getPairOrNextHigherBy(key, this.comparator);
	}

	/**
	 * Compares two `AppendOnlySortedMap`s.
	 */
	public equals(other: AppendOnlySortedMap<K, V>, compareValues: (a: V, b: V) => boolean): boolean {
		if (other === this) {
			return true;
		}

		if (this.elements.length !== other.elements.length) {
			return false;
		}

		for (let i = this.elements.length - 2; i >= 0; i -= 2) {
			const keyThis = this.elements[i] as K;
			const valueThis = this.elements[i + 1] as V;
			const keyOther = other.elements[i] as K;
			const valueOther = other.elements[i + 1] as V;
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
		let prev: readonly [K, unknown] | undefined;
		for (const kv of this.entries()) {
			if (prev !== undefined) {
				assert(this.comparator(kv[0], prev[0]) > 0, 'Keys in map must be sorted.');
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
	public *getRange(from: K, to: K): IterableIterator<readonly [K, V]> {
		const keyIndexFrom = this.getKeyIndexOfOrNextHigher(from, this.comparator);
		if (keyIndexFrom === undefined) {
			return;
		}

		const keyIndexTo = this.getKeyIndexOfOrNextLower(to, this.comparator);
		if (keyIndexTo === undefined) {
			return;
		}

		for (let i = keyIndexFrom; i <= keyIndexTo; i += 2) {
			yield [this.elements[i] as K, this.elements[i + 1] as V];
		}
	}

	protected getPairOrNextLowerBy<T>(
		search: T,
		comparator: (search: T, key: K, value: V) => number
	): readonly [K, V] | undefined {
		const keyIndex = this.getKeyIndexOfOrNextLower(search, comparator);
		if (keyIndex === undefined) {
			return undefined;
		}

		return [this.elements[keyIndex] as K, this.elements[keyIndex + 1] as V];
	}

	private getKeyIndexOfOrNextLower<T>(
		search: T,
		comparator: (search: T, key: K, value: V) => number
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
		comparator: (search: T, key: K, value: V) => number
	): readonly [K, V] | undefined {
		const keyIndex = this.getKeyIndexOfOrNextHigher(search, comparator);
		if (keyIndex === undefined) {
			return undefined;
		}

		return [this.elements[keyIndex] as K, this.elements[keyIndex + 1] as V];
	}

	private getKeyIndexOfOrNextHigher<T>(
		search: T,
		comparator: (search: T, key: K, value: V) => number
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
	public static keyIndexOf<T, K, V>(
		elements: readonly (K | V)[],
		search: T,
		comparator: (search: T, key: K, value: V) => number
	): number {
		// Low, high, and mid are addresses of [K,V] pairs and *not* key indices
		let low = 0;
		let high = elements.length / 2;
		let mid = high >> 1;
		while (low < high) {
			const keyIndex = mid * 2;
			const c = comparator(search, elements[keyIndex] as K, elements[keyIndex + 1] as V);
			if (c > 0) {
				low = mid + 1;
			} else if (c < 0) {
				high = mid;
			} else if (c === 0) {
				return keyIndex;
			} else {
				fail('Invalid comparator.');
			}
			mid = (low + high) >> 1;
		}
		return (mid * 2) ^ AppendOnlySortedMap.failureXor;
	}
}

/**
 * A map in which entries are always added in both key-sorted and value-sorted order.
 * Supports appending and searching.
 */
export class AppendOnlyDoublySortedMap<K, V, S> extends AppendOnlySortedMap<K, V> {
	public constructor(
		keyComparator: (a: K, b: K) => number,
		private readonly extractSearchValue: (value: V) => S,
		private readonly valueComparator: (search: S, value: S) => number
	) {
		super(keyComparator);
	}

	public append(key: K, value: V): void {
		if (
			this.elements.length !== 0 &&
			this.valueComparator(this.extractSearchValue(value), this.extractSearchValue(this.maxValue() as V)) <= 0
		) {
			fail('Inserted value must be > all others in the map.');
		}
		super.append(key, value);
	}

	private readonly compareValues = (search: S, _: K, value: V): number => {
		return this.valueComparator(search, this.extractSearchValue(value));
	};

	/**
	 * @param value - the value to lookup.
	 * @returns the key associated with `value` if such an entry exists, and undefined otherwise.
	 */
	public getByValue(value: S): K | undefined {
		const index = AppendOnlySortedMap.keyIndexOf(this.elements, value, this.compareValues);
		return this.elements[index]?.[0];
	}

	/**
	 * @param searchValue - the search value to lookup.
	 * @returns the entry who's value, when run through the extractor provided to the constructor, matches
	 * `searchValue`. If no such entry exists, this method returns the next lower entry as determined by the value
	 * comparator provided to the constructor. If no such entry exists, this method returns undefined.
	 */
	public getPairOrNextLowerByValue(searchValue: S): readonly [K, V] | undefined {
		return this.getPairOrNextLowerBy(searchValue, this.compareValues);
	}

	/**
	 * @param searchValue - the search value to lookup.
	 * @returns the entry who's value, when run through the extractor provided to the constructor, matches `searchValue`. If no such entry
	 * exists, this method returns the next higher entry as determined by the value comparator provided to the constructor. If no such entry
	 * exists, this method returns undefined.
	 */
	public getPairOrNextHigherByValue(searchValue: S): readonly [K, V] | undefined {
		return this.getPairOrNextHigherBy(searchValue, this.compareValues);
	}

	/**
	 * Test-only expensive assertions to check the internal validity of the data structure.
	 */
	public assertValid(): void {
		super.assertValid();
		let prev: readonly [unknown, V] | undefined;
		for (const kv of this.entries()) {
			if (prev !== undefined) {
				assert(
					this.valueComparator(this.extractSearchValue(kv[1]), this.extractSearchValue(prev[1])) > 0,
					'Values in map must be sorted.'
				);
			}
			prev = kv;
		}
	}
}
