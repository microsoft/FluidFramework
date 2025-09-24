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
 * This only handles a few cases (TreeNode, structurally typed objects fields and arrays) and leaves other types as is.
 * Users which provide other types (e.g. maps) which contain TreeNodes will need to handle wrapping those themselves if the wrapping is desired.
 *
 * Users of this should not rely on a given use of TreeNode not being wrapped:
 * future changes to this API may add more cases which are wrapped, and this will be considered a non-breaking change.
 * @privateRemarks
 * Covering all cases is impossible, and trying to cover more with recursive mapped types can break some of the types by losing methods, private members, etc.
 * To mitigate this IsMappableObjectType is used for objects, and only mappable types, where the mapping actually impacted the type are modified.
 *
 * This is intended to cover the common cases, and users can handle other cases manually.
 * See the tests for this for more details.
 * @public
 */
export type WrapNodes<T> = T extends TreeNode
	? PropTreeNode<T>
	: T extends readonly (infer U)[]
		? readonly WrapNodes<U>[]
		: // `T extends (infer U)` distributes over unions, allowing WrapNodes<A|B> to be WrapNodes<A> | WrapNodes<B>.
			T extends infer U
			? IsMappableObjectType<
					U,
					{
						[P in keyof U]: WrapNodes<U[P]>;
					} extends U
						? // Returning U in this case (when assignable to the mapped type) avoids flatting named interfaces when they are unchanged.
							U
						: {
								[P in keyof U]: WrapNodes<U[P]>;
							},
					T
				>
			: T;

/**
 * Detect if a type is a simple structural object.
 * @remarks
 * This returns the true case if the type is entirely defined by its set of public properties.
 * More concretely, this indicates if creating a mapped type based on `T`
 * will be lossy due to details mapped types cannot access.
 *
 * This is shallow, and distributes over unions.
 *
 * This also returns the true case for primitive types since mapping over them leaves them unchanged if doing so in a generic context:
 * Mapping over a primitive does not leave them unchanged if done directly (not to a generic type parameter), but this can not detect that behavior.
 * This is fine as the use for this is to detect when making a mapped type from a generic type parameter would be lossy.
 * @system @public
 */
export type IsMappableObjectType<
	T,
	True = true,
	False = false,
	Mapped = {
		[P in keyof T]: T[P];
	},
> = [Mapped] extends [T] ? ([T] extends [Mapped] ? True : False) : False;

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
