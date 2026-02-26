/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A tree where each node holds a value of type `T` and zero or more children.
 *
 * @sealed @alpha
 */
export interface ValueTree<T = unknown> {
	/**
	 * The value at this node.
	 */
	value: T;

	/**
	 * The children of this node.
	 */
	children: ValueTree<T>[];
}
