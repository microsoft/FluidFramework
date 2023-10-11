/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable tsdoc/syntax */

import { RedBlackTree, compareNumbers } from "@fluidframework/merge-tree";

/**
 * A utility class for tracking associations between keys and their creation indices.
 * This is relevant to support map iteration in insertion order, see
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Iterator/@@iterator
 */
export class CreationIndexTracker {
	/**
	 * A red-black tree that maps index to key, ensuring that keys are organized according to
	 * their creation order
	 */
	readonly indexToKey: RedBlackTree<number, string>;

	/**
	 * A map that maps keys to their corresponding creation indices, it is for efficient look-up,
	 * and created only if needed
	 */
	readonly keyToIndex?: Map<string, number>;

	/**
	 * @param needKeyToIndex - Whether to create the keyToIndex map, defaults to true.
	 */
	constructor(needKeyToIndex: boolean = true) {
		this.indexToKey = new RedBlackTree<number, string>(compareNumbers);
		if (needKeyToIndex) {
			this.keyToIndex = new Map<string, number>();
		}
	}

	/**
	 * Sets the association between a key and its corresponding index.
	 * @param key - The key associated with its creation idnex.
	 * @param index - The creation index of a key.
	 */
	set(key: string, index: number): void {
		// if (!this.has(key)) {
		this.indexToKey.put(index, key);
		this.keyToIndex?.set(key, index);
		// }
	}

	/**
	 * Retrieves the creation index associated with a given key.
	 * @param key - The key for which to retrieve the creation index.
	 * @returns The index associated with the key, or undefined if not found.
	 */
	get(key: string): number | undefined {
		return this.keyToIndex?.get(key);
	}

	/**
	 * Checks if a key or creation index exists in the tracker.
	 * @param keyOrIndex - The key (string) or index (number) to check for existence.
	 * @returns True if the key or index exists; otherwise, false.
	 */
	has(keyOrIndex: string | number): boolean {
		if (typeof keyOrIndex === "string" && this.keyToIndex) {
			return this.keyToIndex?.has(keyOrIndex);
		} else if (typeof keyOrIndex === "number") {
			return this.indexToKey.get(keyOrIndex) !== undefined;
		}
		return false;
	}

	/**
	 * Deletes the association between a key and its corresponding creation index.
	 * @param keyOrIndex - The key (string) or index (number) to delete.
	 */
	delete(keyOrIndex: string | number): void {
		if (this.has(keyOrIndex)) {
			if (typeof keyOrIndex === "number") {
				this.indexToKey.remove(keyOrIndex);
			} else if (typeof keyOrIndex === "string" && this.keyToIndex) {
				const index = this.keyToIndex.get(keyOrIndex);
				this.keyToIndex.delete(keyOrIndex);
				this.indexToKey.remove(index as number);
			}
		}
	}

	/**
	 * Clears all records and resets the tracker.
	 */
	clear(): void {
		this.indexToKey.clear();
		this.keyToIndex?.clear();
	}

	/**
	 * Retrieves all keys with creation order that satisfy an optional constraint function.
	 * @param constraint - An optional constraint function that filters keys.
	 * @returns An array of keys that satisfy the constraint (or all keys if no constraint is provided).
	 */
	keys(constraint?: (key: string) => boolean): string[] {
		const keys: string[] = [];
		this.indexToKey.mapRange((node) => {
			if (!constraint || constraint(node.data)) {
				keys.push(node.data);
			}
			return true;
		}, keys);
		return keys;
	}

	/**
	 * @returns The number of keys/items in the tracker.
	 */
	size(): number {
		return this.indexToKey.size();
	}

	/**
	 * @returns The maimum creation index or undefined if the tracker is empty.
	 */
	max(): number | undefined {
		return this.indexToKey.max()?.key;
	}
}
