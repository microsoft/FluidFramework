/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AllowedTypes } from "../feature-libraries";
import {
	type ImplicitAllowedTypes,
	type TreeNodeFromImplicitAllowedTypes,
	type InsertableTreeNodeFromImplicitAllowedTypes,
} from "../class-tree";
import { InsertableTreeNodeUnion } from "./insertable";
import { TreeArrayNodeBase, TreeNodeUnion } from "./types";

/**
 * A {@link TreeNode} which implements 'readonly T[]' and the list mutation APIs.
 */
export interface TreeListNodeOld<out TTypes extends AllowedTypes = AllowedTypes>
	extends TreeArrayNodeBase<
		TreeNodeUnion<TTypes>,
		InsertableTreeNodeUnion<TTypes>,
		TreeListNodeOld
	> {}

/**
 * A {@link NodeBase} which implements 'readonly T[]' and the list mutation APIs.
 * @beta
 */
export interface TreeArrayNode<T extends ImplicitAllowedTypes = ImplicitAllowedTypes>
	extends TreeArrayNodeBase<
		TreeNodeFromImplicitAllowedTypes<T>,
		InsertableTreeNodeFromImplicitAllowedTypes<T>,
		TreeArrayNode
	> {}

/**
 * A {@link NodeBase} which implements 'readonly T[]' and the list mutation APIs.
 * @beta
 */
export const TreeArrayNode = {
	/**
	 * Wrap an iterable of items to inserted as consecutive items in a list.
	 * @remarks
	 * The object returned by this function can be inserted into a {@link (TreeArrayNode:interface)}.
	 * Its contents will be inserted consecutively in the corresponding location in the list.
	 * @example
	 * ```ts
	 * list.insertAtEnd(TreeArrayNode.inline(iterable))
	 * ```
	 */
	inline: <T>(content: Iterable<T>) => IterableTreeListContent[create](content),
};

/**
 * Non-exported symbol used to make IterableTreeListContent constructable only from within this file.
 */
const create = Symbol("Create IterableTreeListContent");

/**
 * Used to insert iterable content into a {@link (TreeArrayNode:interface)}.
 * Use {@link (TreeArrayNode:variable).inline} to create an instance of this type.
 * @beta
 */
export class IterableTreeListContent<T> implements Iterable<T> {
	private constructor(private readonly content: Iterable<T>) {}

	/**
	 * Package internal construction API.
	 * Use {@link (TreeArrayNode:variable).inline} to create an instance of this type instead.
	 */
	public static [create]<T>(content: Iterable<T>): IterableTreeListContent<T> {
		return new IterableTreeListContent(content);
	}

	/**
	 * Iterates over content for nodes to insert.
	 */
	public [Symbol.iterator](): Iterator<T> {
		return this.content[Symbol.iterator]();
	}
}
