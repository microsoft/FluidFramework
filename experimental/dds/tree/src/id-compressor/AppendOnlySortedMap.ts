/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/* eslint-disable no-bitwise */

import { fail } from '../Common';

/**
 * A map in which entries are always added in key-sorted order.
 * Supports appending and searching.
 */
export class AppendOnlySortedMap<K, V> {
	protected readonly elements: [K, V][] = [];

	/**
	 * @param comparator a comparator for keys
	 */
	public constructor(protected readonly comparator: (a: K, b: K) => number) {}

	/**
	 * @returns the number of entries in this map
	 */
	public get size(): number {
		return this.elements.length;
	}

	/**
	 * @returns the min key in the map.
	 */
	public minKey(): K | undefined {
		return this.elements[0]?.[0];
	}

	/**
	 * @returns the max key in the map.
	 */
	public maxKey(): K | undefined {
		return this.elements[this.size - 1]?.[0];
	}

	/**
	 * @returns an iterable of the entries in the map.
	 */
	public *entries(): IterableIterator<readonly [K, V]> {
		for (const entry of this.elements) {
			yield entry;
		}
	}

	/**
	 * @returns an iterable of the keys in the map.
	 */
	public *keys(): IterableIterator<K> {
		for (const entry of this.elements) {
			yield entry[0];
		}
	}

	/**
	 * @returns an iterable of the values in the map.
	 */
	public *values(): IterableIterator<V> {
		for (const entry of this.elements) {
			yield entry[1];
		}
	}

	/**
	 * @returns an iterable of the entries in the map, reversed.
	 */
	public *entriesReversed(): IterableIterator<readonly [K, V]> {
		for (let i = this.size - 1; i >= 0; i--) {
			yield this.elements[i];
		}
	}

	/**
	 * Adds a new key/value pair to the map. `key` must be > to all keys in the map.
	 * @param key the key to add.
	 * @param value the value to add.
	 */
	public append(key: K, value: V): void {
		if (this.size !== 0 && this.comparator(key, this.elements[this.size - 1][0]) <= 0) {
			fail('Inserted key must be > all others in the map.');
		}
		this.elements.push([key, value]);
	}

	private readonly compareKeys = (search: K, element: readonly [K, V]): number => {
		return this.comparator(search, element[0]);
	};

	/**
	 * @param key the key to lookup.
	 * @returns the value associated with `key` if such an entry exists, and undefined otherwise.
	 */
	public get(key: K): V | undefined {
		const index = AppendOnlySortedMap.indexOf(this.elements, key, this.compareKeys);
		return this.elements[index]?.[1];
	}

	/**
	 * @param key the key to lookup.
	 * @returns the entry associated with `key` if such an entry exists, the entry associated with the next lower key if such an entry
	 * exists, and undefined otherwise.
	 */
	public getPairOrNextLower(key: K): readonly [K, V] | undefined {
		return this.getPairOrNextLowerBy(key, this.compareKeys);
	}

	/**
	 * @param key the key to lookup.
	 * @returns the entry associated with `key` if such an entry exists, the entry associated with the next higher key if such an entry
	 * exists, and undefined otherwise.
	 */
	public getPairOrNextHigher(key: K): readonly [K, V] | undefined {
		return this.getPairOrNextHigherBy(key, this.compareKeys);
	}

	/**
	 * Compares two `AppendOnlySortedMap`s.
	 */
	public equals(other: AppendOnlySortedMap<K, V>, compareValues: (a: V, b: V) => boolean): boolean {
		if (other === this) {
			return true;
		}

		if (this.size !== other.size) {
			return false;
		}

		for (let i = this.size - 1; i >= 0; i--) {
			const [keyThis, valueThis] = this.elements[i];
			const [keyOther, valueOther] = other.elements[i];
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
	 * Queries a range of entries.
	 * @param from the key to start the range query at, inclusive.
	 * @param to the key to end the range query at, inclusive.
	 * @returns the range of entries.
	 */
	public *getRange(from: K, to: K): IterableIterator<readonly [K, V]> {
		const indexFrom = this.getIndexOfOrNextHigher(from, this.compareKeys);
		if (indexFrom === undefined) {
			return;
		}

		const indexTo = this.getIndexOfOrNextLower(to, this.compareKeys);
		if (indexTo === undefined) {
			return;
		}

		for (let i = indexFrom; i <= indexTo; i++) {
			yield this.elements[i];
		}
	}

	protected getPairOrNextLowerBy<T>(
		search: T,
		comparator: (search: T, element: readonly [K, V]) => number
	): readonly [K, V] | undefined {
		const index = this.getIndexOfOrNextLower(search, comparator);
		if (index === undefined) {
			return undefined;
		}

		return this.elements[index];
	}

	private getIndexOfOrNextLower<T>(
		search: T,
		comparator: (search: T, element: readonly [K, V]) => number
	): number | undefined {
		const { size } = this;
		if (size === 0) {
			return undefined;
		}
		let index = AppendOnlySortedMap.indexOf(this.elements, search, comparator);
		if (index < 0) {
			index ^= AppendOnlySortedMap.failureXor;
			if (index > 0) {
				return index - 1;
			}
			return undefined;
		}
		return index;
	}

	protected getPairOrNextHigherBy<T>(
		search: T,
		comparator: (search: T, element: readonly [K, V]) => number
	): readonly [K, V] | undefined {
		const index = this.getIndexOfOrNextHigher(search, comparator);
		if (index === undefined) {
			return undefined;
		}

		return this.elements[index];
	}

	private getIndexOfOrNextHigher<T>(
		search: T,
		comparator: (search: T, element: readonly [K, V]) => number
	): number | undefined {
		const { size } = this;
		if (size === 0) {
			return undefined;
		}
		let index = AppendOnlySortedMap.indexOf(this.elements, search, comparator);
		if (index < 0) {
			index ^= AppendOnlySortedMap.failureXor;
			if (index < size) {
				return index;
			}
			return undefined;
		}
		return index;
	}

	/**
	 * The value xor'd with the result index when a search fails.
	 */
	public static readonly failureXor = -1;

	/**
	 * Performs a binary search on the sorted array.
	 * @param elements
	 * @param search
	 * @param comparator
	 * @returns the index of `search`, or (if not present) the index it would have been inserted into xor'd with `failureXor`. Note that
	 * negating is not an adequate solution as that could result in -0.
	 */
	public static indexOf<T, K, V>(
		elements: readonly (readonly [K, V])[],
		search: T,
		comparator: (search: T, element: readonly [K, V]) => number
	): number {
		let low = 0;
		let high = elements.length;
		let mid = high >> 1;
		while (low < high) {
			const c = comparator(search, elements[mid]);
			if (c > 0) {
				low = mid + 1;
			} else if (c < 0) {
				high = mid;
			} else if (c === 0) {
				return mid;
			} else {
				fail('Invalid comparator.');
			}
			mid = (low + high) >> 1;
		}
		return mid ^ AppendOnlySortedMap.failureXor;
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
		private readonly valueComparator: (search: S, value: V) => number
	) {
		super(keyComparator);
	}

	public append(key: K, value: V): void {
		if (
			this.size !== 0 &&
			this.valueComparator(this.extractSearchValue(value), this.elements[this.size - 1][1]) <= 0
		) {
			fail('Inserted value must be > all others in the map.');
		}
		super.append(key, value);
	}

	private readonly compareValues = (search: S, element: readonly [K, V]): number => {
		return this.valueComparator(search, element[1]);
	};

	/**
	 * @param value the value to lookup.
	 * @returns the key associated with `value` if such an entry exists, and undefined otherwise.
	 */
	public getByValue(value: S): K | undefined {
		const index = AppendOnlySortedMap.indexOf(this.elements, value, this.compareValues);
		return this.elements[index]?.[0];
	}

	/**
	 * @param searchValue the search value to lookup.
	 * @returns the entry who's value, when run through the extractor provided to the constructor, matches `searchValue`. If no such entry
	 * exists, this method returns the next lower entry as determined by the value comparator provided to the constructor. If no such entry
	 * exists, this method returns undefined.
	 */
	public getPairOrNextLowerByValue(searchValue: S): readonly [K, V] | undefined {
		return this.getPairOrNextLowerBy(searchValue, this.compareValues);
	}

	/**
	 * @param searchValue the search value to lookup.
	 * @returns the entry who's value, when run through the extractor provided to the constructor, matches `searchValue`. If no such entry
	 * exists, this method returns the next higher entry as determined by the value comparator provided to the constructor. If no such entry
	 * exists, this method returns undefined.
	 */
	public getPairOrNextHigherByValue(searchValue: S): readonly [K, V] | undefined {
		return this.getPairOrNextHigherBy(searchValue, this.compareValues);
	}
}
