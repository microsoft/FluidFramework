/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A tree of values that mirrors the nesting structure of transactions.
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
}

/**
 * Mutable implementation of {@link ValueTree}.
 *
 * @remarks
 * Used internally to incrementally build a value tree as nested scopes open and close.
 * The mutable `children` array allows in-place tree construction,
 * while the class still satisfies the readonly {@link ValueTree} interface for consumers.
 */
export class ValueTreeNode<T = unknown> implements ValueTree<T> {
	public readonly value: T;
	public readonly children: ValueTreeNode<T>[] = [];

	public constructor(value: T, children?: readonly ValueTreeNode<T>[]) {
		this.value = value;
		if (children !== undefined) {
			for (const child of children) {
				this.children.push(child);
			}
		}
	}
}
