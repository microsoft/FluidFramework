/*!
 * Copyright (c) Microsoft Corporation. All rights reserved.
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
	 * @returns an iterable of the entries in the map, reversed.
	 */
	public *entriesReversed(): IterableIterator<readonly [K, V]> {
		for (let i = this.size - 1; i >= 0; i--) {
			yield this.elements[i];
		}
	}

	/**
	 * Adds a new key/value pair to the map. `key` must be >= to all keys in the map.
	 * @param key the key to add.
	 * @param value the value to add.
	 */
	public append(key: K, value: V): void {
		if (this.size !== 0 && this.comparator(key, this.elements[this.size - 1][0]) < 0) {
			fail('Inserted key must be >= all others in the map.');
		}
		this.elements.push([key, value]);
	}

	private readonly compareKeys = (search: K, element: [K, V]): number => {
		return this.comparator(search, element[0]);
	};

	/**
	 * @param key the key to lookup.
	 * @returns the value associated with `key` if such an entry exists, and undefined otherwise.
	 */
	public get(key: K): V | undefined {
		const index = this.indexOf(key, this.compareKeys);
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

	protected getPairOrNextLowerBy<T>(
		search: T,
		comparator: (search: T, element: [K, V]) => number
	): readonly [K, V] | undefined {
		const { elements, size } = this;
		if (size === 0) {
			return undefined;
		}
		let index = this.indexOf(search, comparator);
		if (index < 0) {
			index ^= AppendOnlySortedMap.failureXor;
			if (index > 0) {
				return elements[(index < size ? index : size) - 1];
			}
			return undefined;
		}
		return elements[index];
	}

	private static readonly failureXor = -1;
	private indexOf<T>(search: T, comparator: (search: T, element: [K, V]) => number): number {
		const { elements, size } = this;
		let low = 0;
		let high = size;
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
			this.valueComparator(this.extractSearchValue(value), this.elements[this.size - 1][1]) < 0
		) {
			fail('Inserted value must be >= all others in the map.');
		}
		super.append(key, value);
	}

	private compareValues(search: S, element: [K, V]): number {
		return this.valueComparator(search, element[1]);
	}

	/**
	 * @param searchValue the search value to lookup.
	 * @returns the entry who's value, when run through the extractor provided to the constructor, matches `searchValue`. If no such entry
	 * exists, this method returns the next lower entry as determined by the value comparator provided to the constructor. If no such entry
	 * exists, this method returns undefined.
	 */
	public getPairOrNextLowerByValue(searchValue: S): readonly [K, V] | undefined {
		return this.getPairOrNextLowerBy(searchValue, this.compareValues.bind(this));
	}
}
