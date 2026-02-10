/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A tree of labels that supports recursive search and Set-like read operations.
 *
 * @remarks
 * Each node in the tree has a label of type `T` and zero or more children.
 * The tree is immutable after construction.
 *
 * @sealed @alpha
 */
export class LabelTree<T = unknown> {
	/**
	 * The label value at this node.
	 */
	public readonly label: T;

	/**
	 * The children of this node.
	 */
	public readonly children: readonly LabelTree<T>[];

	public constructor(label: T, children: readonly LabelTree<T>[] = []) {
		this.label = label;
		this.children = children;
	}

	/**
	 * Returns `true` if this tree contains the given label at this node or any descendant node.
	 *
	 * @remarks Comparison uses reference equality (`===`).
	 */
	public has(label: T): boolean {
		if (this.label === label) {
			return true;
		}
		for (const child of this.children) {
			if (child.has(label)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Iterates over all label values in the tree in depth-first pre-order.
	 */
	public *values(): IterableIterator<T> {
		yield this.label;
		for (const child of this.children) {
			yield* child.values();
		}
	}

	/**
	 * Executes a provided function once for each label value in the tree,
	 * in depth-first pre-order.
	 */
	public forEach(callbackfn: (value: T) => void): void {
		for (const value of this.values()) {
			callbackfn(value);
		}
	}

	/**
	 * The total number of nodes in this tree (this node plus all descendants).
	 */
	public get size(): number {
		let count = 1;
		for (const child of this.children) {
			count += child.size;
		}
		return count;
	}
}
