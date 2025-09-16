/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedType } from "@fluidframework/core-interfaces/internal";
import type { TreeNode, TreeLeafValue } from "@fluidframework/tree";
import { Tree } from "@fluidframework/tree";
// eslint-disable-next-line import/no-internal-modules
import { TreeAlpha } from "@fluidframework/tree/alpha";
import * as React from "react";

// TODO:
// Expose useViewRoot
// https://github.com/microsoft/FluidFramework/pull/18659

/**
 * Custom hook which invalidates a React Component when there is a change in the subtree defined by `subtreeRoot`.
 * This includes changes to the tree's content, but not changes to its parentage.
 * See {@link @fluidframework/tree#TreeChangeEvents.treeChanged} for details.
 * @remarks
 * Consider using {@link useTreeObservations} instead which tracks what was observed and only invalidates if it changes.
 * @public
 */
export function useTree(subtreeRoot: TreeNode): number {
	// Use a React effect hook to invalidate this component when the subtreeRoot changes.
	// We do this by incrementing a counter, which is passed as a dependency to the effect hook.
	const [invalidations, setInvalidations] = React.useState(0);

	// React effect hook that increments the 'invalidation' counter whenever subtreeRoot or any of its children change.
	React.useEffect(() => {
		// Returns the cleanup function to be invoked when the component unmounts.
		return Tree.on(subtreeRoot, "treeChanged", () => {
			setInvalidations((i) => i + 1);
		});
	}, [invalidations, subtreeRoot]);

	return invalidations;
}

/**
 * Custom hook which invalidates a React Component when there is a change in tree content observed during `trackDuring`.
 * @remarks
 * This includes changes to the tree's content.
 * Currently this will throw if observing a node's parentage, and node status changes will not cause invalidation.
 *
 * For additional type safety to help avoid observing TreeNode content outside of this hook, see {@link PropTreeNode}.
 * @public
 */
export function useTreeObservations<TResult>(trackDuring: () => TResult): TResult {
	// Use a React effect hook to invalidate this component when the subtreeRoot changes.
	// We do this by incrementing a counter, which is passed as a dependency to the effect hook.
	const [invalidations, setInvalidations] = React.useState(0);

	let invalidated = false;

	const invalidate = (): void => {
		invalidated = true;
		out.unsubscribe();
		setInvalidations((i) => i + 1);
	};

	const out = TreeAlpha.trackObservations(invalidate, trackDuring);

	// Unsubscribe on unmount (or anytime we recompute out).
	React.useEffect(() => () => {
		if (!invalidated) {
			out.unsubscribe();
		}
	});

	return out.result;
}

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
 * Custom hook for using a prop tree node.
 *
 * @param propNode - Input, automatically unwrapped TreeNode from a {@link PropTreeNode} if needed.
 * @param trackDuring - Callback which reads from the node and returns a result.
 * If the result is a TreeNode or {@link NodeRecord} it will be wrapped as a {@link PropTreeNode} or {@link PropTreeNodeRecord}, see {@link WrapNodes}.
 * It is recommended that for improved type safety if returning nodes (or otherwise transferring them out of this function),
 * either use a format supported by {@link WrapNodes} or wrap the nodes manually using {@link toPropTreeNode}.
 * Note that is is fine to observe any node inside the callback, not just the provided node: all accesses will be tracked.
 * The provided node is just provided as a way to automatically unwrap the {@link PropTreeNode}
 *
 * @remarks
 * Reads content using {@link useTreeObservations} to track dependencies.
 * @public
 */
export function usePropTreeNode<T extends TreeNode | TreeLeafValue, TResult>(
	propNode: PropTreeValue<T> | T,
	trackDuring: (node: T) => TResult,
): WrapNodes<TResult> {
	const node: T = unwrapPropTreeNode(propNode);

	const result = useTreeObservations(() => trackDuring(node));

	return result as WrapNodes<TResult>;
}

/**
 * Type TreeNodes in T as {@link PropTreeNode}s.
 * @remarks
 * This only handles a few cases (TreeNode, NodeRecord) and leaves other types as is.
 * Users which provide other types (e.g. arrays) which contain TreeNodes will need to handle wrapping those themselves if the wrapping is desired.
 * @public
 */
export type WrapNodes<T> = T extends TreeNode
	? PropTreeNode<T>
	: T extends NodeRecord
		? WrapPropTreeNodeRecord<T>
		: T;

/**
 * {@link usePropTreeNode} but takes in a {@link PropTreeNodeRecord}.
 * @public
 */
export function usePropTreeRecord<const T extends PropTreeNodeRecord, TResult>(
	props: T,
	f: (node: UnwrapPropTreeNodeRecord<T>) => TResult,
): WrapNodes<TResult> {
	const record = unwrapPropTreeRecord(props);

	const result = useTreeObservations(() => f(record));

	return result as WrapNodes<TResult>;
}

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
