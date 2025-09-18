/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedType } from "@fluidframework/core-interfaces";
import type { TreeNode, TreeLeafValue } from "@fluidframework/tree";

/**
 * A type erased TreeNode for use in react props.
 * @remarks
 * Read content from the node using {@link usePropTreeNode} or {@link usePropTreeRecord}.
 *
 * In events where tracking dependencies is not required, the node can be unwrapped using {@link unwrapPropTreeNode}.
 *
 * To convert a TreeNode to this type use {@link toPropTreeNode} or {@link toPropTreeRecord}.
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PropTreeNode<T extends TreeNode> extends ErasedType<[T, "PropTreeNode"]> {}

/**
 * Type TreeNodes in T as {@link PropTreeNode}s.
 * @remarks
 * This only handles a few cases (TreeNode, NodeRecord, arrays) and leaves other types as is.
 * Users which provide other types (e.g. maps) which contain TreeNodes will need to handle wrapping those themselves if the wrapping is desired.
 * @public
 */
export type WrapNodes<T> = T extends TreeNode
	? PropTreeNode<T>
	: T extends readonly (infer U)[]
		? readonly WrapNodes<U>[]
		: T extends NodeRecord
			? WrapPropTreeNodeRecord<T>
			: T;

/**
 * Casts a node from a {@link PropTreeNode} back to a TreeNode.
 * @remarks
 * This should only be done in scenarios where tracking observations is not required (such as event handlers),
 * or when taking care to handle invalidation manually.
 * @public
 */
export function unwrapPropTreeNode<T extends TreeNode | TreeLeafValue>(
	propNode: PropTreeValue<T> | T,
): T {
	return propNode as T;
}

/**
 * {@link unwrapPropTreeNode} but for a {@link PropTreeNodeRecord}.
 * @public
 */
export function unwrapPropTreeRecord<T extends PropTreeNodeRecord>(
	props: T,
): UnwrapPropTreeNodeRecord<T> {
	return props as UnwrapPropTreeNodeRecord<T>;
}

/**
 * {@inheritdoc unwrapPropTreeNode}
 * @public
 */
export type UnwrapPropTreeNode<T extends TreeLeafValue | PropTreeNode<TreeNode> | undefined> =
	T extends PropTreeNode<infer Node> ? Node : T;

/**
 * Record that can contain TreeNodes.
 * @public
 */
export type NodeRecord = Record<string, TreeNode | TreeLeafValue>;

/**
 * Type erase `TreeNode`s from a {@link NodeRecord} as a {@link PropTreeNode}.
 * @public
 */
export type WrapPropTreeNodeRecord<T extends NodeRecord> = {
	readonly [P in keyof T]: PropTreeValue<T[P]>;
};

/**
 * Type erase `TreeNode`s from a {@link NodeRecord} as a {@link PropTreeNode}.
 * @public
 */
export type UnwrapPropTreeNodeRecord<T extends PropTreeNodeRecord> = {
	readonly [P in keyof T]: UnwrapPropTreeNode<T[P]>;
};

/**
 * Type erase `TreeNode`s from a {@link NodeRecord} as a {@link PropTreeNode}.
 * @public
 */
export type PropTreeNodeRecord = Record<
	string,
	TreeLeafValue | PropTreeNode<TreeNode> | undefined
>;

/**
 * Type erase a `TreeNode` from a `TreeNode | TreeLeafValue` as a {@link PropTreeNode}.
 * @public
 */
export type PropTreeValue<T extends TreeNode | TreeLeafValue | undefined> = T extends TreeNode
	? PropTreeNode<T>
	: T;

/**
 * Type erase a TreeNode as a {@link PropTreeNode}.
 * @public
 */
export function toPropTreeNode<T extends TreeNode | TreeLeafValue>(node: T): PropTreeValue<T> {
	return node as unknown as PropTreeValue<T>;
}

/**
 * Type erase a {@link NodeRecord} as a {@link PropTreeNodeRecord}.
 * @public
 */
export function toPropTreeRecord<T extends NodeRecord>(node: T): WrapPropTreeNodeRecord<T> {
	return node as unknown as WrapPropTreeNodeRecord<T>;
}
