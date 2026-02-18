/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A tree of values that supports recursive search and Set-like read operations.
 *
 * @remarks
 * Each node in the tree has a value of type `T` and zero or more children.
 *
 * @sealed @alpha
 */
export interface ValueTree<T = unknown> {
	/**
	 * The value at this node.
	 */
	readonly value: T;

	/**
	 * The children of this node.
	 */
	readonly children: readonly ValueTree<T>[];

	/**
	 * Returns `true` if this tree contains the given value at this node or any descendant node.
	 *
	 * @param value - The value to search for.
	 * @param areEqual - Optional equality function. Defaults to {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/is | Object.is}.
	 */
	has(value: T, areEqual?: (a: T, b: T) => boolean): boolean;

	/**
	 * Iterates over all values in the tree in depth-first pre-order.
	 */
	values(): IterableIterator<T>;

	/**
	 * Executes a provided function once for each value in the tree,
	 * in depth-first pre-order.
	 */
	forEach(callbackfn: (value: T) => void): void;

	/**
	 * The total number of nodes in this tree (this node plus all descendants).
	 */
	readonly size: number;
}

/**
 * Mutable implementation of {@link ValueTree} with parent pointers for tree navigation.
 *
 * @remarks
 * Used internally to incrementally build a value tree as nested scopes open and close.
 * The mutable `children` array and `parent` pointer allow in-place tree construction,
 * while the class still satisfies the readonly {@link ValueTree} interface for consumers.
 */
export class ValueTreeNode<T = unknown> implements ValueTree<T> {
	public readonly value: T;
	public readonly children: ValueTreeNode<T>[] = [];
	public parent: ValueTreeNode<T> | undefined;

	public constructor(
		value: T,
		parentOrChildren?: ValueTreeNode<T> | readonly ValueTreeNode<T>[],
	) {
		this.value = value;
		if (Array.isArray(parentOrChildren)) {
			for (const child of parentOrChildren as ValueTreeNode<T>[]) {
				child.parent = this;
				this.children.push(child);
			}
		} else {
			this.parent = parentOrChildren as ValueTreeNode<T> | undefined;
		}
	}

	public has(value: T, areEqual: (a: T, b: T) => boolean = Object.is): boolean {
		if (areEqual(this.value, value)) {
			return true;
		}
		for (const child of this.children) {
			if (child.has(value, areEqual)) {
				return true;
			}
		}
		return false;
	}

	public *values(): IterableIterator<T> {
		yield this.value;
		for (const child of this.children) {
			yield* child.values();
		}
	}

	public forEach(callbackfn: (value: T) => void): void {
		for (const value of this.values()) {
			callbackfn(value);
		}
	}

	public get size(): number {
		let count = 1;
		for (const child of this.children) {
			count += child.size;
		}
		return count;
	}
}
