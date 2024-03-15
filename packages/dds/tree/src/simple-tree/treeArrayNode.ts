/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	type ImplicitAllowedTypes,
	type InsertableTreeNodeFromImplicitAllowedTypes,
	type TreeNodeFromImplicitAllowedTypes,
} from "./schemaTypes.js";
import { TreeArrayNodeBase, TreeNode } from "./types.js";

/**
 * A {@link TreeNode} which implements 'readonly T[]' and the array mutation APIs.
 *
 * @typeParam TAllowedTypes - Schema for types which are allowed as members of this array.
 *
 * @public
 */
export interface TreeArrayNode<TAllowedTypes extends ImplicitAllowedTypes = ImplicitAllowedTypes>
	extends TreeNode,
		TreeArrayNodeBase<
			TreeNodeFromImplicitAllowedTypes<TAllowedTypes>,
			InsertableTreeNodeFromImplicitAllowedTypes<TAllowedTypes>,
			TreeArrayNode
		> {}

/**
 * A {@link TreeNode} which implements 'readonly T[]' and the array mutation APIs.
 * @public
 */
export const TreeArrayNode = {
	/**
	 * Wrap an iterable of items to inserted as consecutive items in a array.
	 * @remarks
	 * The object returned by this function can be inserted into a {@link (TreeArrayNode:interface)}.
	 * Its contents will be inserted consecutively in the corresponding location in the array.
	 * @example
	 * ```ts
	 * array.insertAtEnd(TreeArrayNode.spread(iterable))
	 * ```
	 */
	spread: <T>(content: Iterable<T>) => create(content),
};

/**
 * Package internal construction API.
 * Use {@link (TreeArrayNode:variable).spread} to create an instance of this type instead.
 */
let create: <T>(content: Iterable<T>) => IterableTreeArrayContent<T>;

/**
 * Used to insert iterable content into a {@link (TreeArrayNode:interface)}.
 * Use {@link (TreeArrayNode:variable).spread} to create an instance of this type.
 * @public
 */
export class IterableTreeArrayContent<T> implements Iterable<T> {
	static {
		create = <T2>(content: Iterable<T2>) => new IterableTreeArrayContent(content);
	}

	private constructor(private readonly content: Iterable<T>) {}

	/**
	 * Iterates over content for nodes to insert.
	 */
	public [Symbol.iterator](): Iterator<T> {
		return this.content[Symbol.iterator]();
	}
}
