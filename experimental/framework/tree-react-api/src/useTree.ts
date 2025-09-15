/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ErasedType } from "@fluidframework/core-interfaces/internal";
import { Tree, TreeNode, type TreeLeafValue } from "@fluidframework/tree";
import * as React from "react";

// TODO:
// Expose useViewRoot
// Hook up inval for useViewRoot and useTree
// Detect + reject parent access
// https://github.com/microsoft/FluidFramework/pull/18659

/**
 * Custom hook which invalidates a React Component when there is a change in the subtree defined by `subtreeRoot`.
 * This includes changes to the tree's content, but not changes to its parentage.
 * See {@link @fluidframework/tree#TreeChangeEvents.treeChanged} for details.
 * @privateRemarks
 * Without a way to get invalidation callbacks for specific fields,
 * it's impractical to implement an ergonomic and efficient more fine-grained invalidation hook.
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
 * A type erased TreeNode for use in react props.
 * @remarks
 * Read content from the node using {@link usePropTreeNode}.
 *
 * In events where tracking dependencies is not required, the node can be unwrapped using {@link unwrapPropTreeNode}.
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PropTreeNode<T extends TreeNode> extends ErasedType<[T, "PropTreeNode"]> {}

/**
 * Custom hook for using a prop tree node.
 * @public
 */
export function usePropTreeNode<
	T extends TreeNode | TreeLeafValue,
	TResult extends NodeRecord,
>(propNode: PropTreeValue<T> | T, f: (node: T) => TResult): WrapPropTreeNodeRecord<TResult> {
	const node: T = unwrapPropTreeNode(propNode);

	const invalidations = node instanceof TreeNode ? useTree(node) : undefined;

	const result = React.useMemo(() => f(node), [node, f, invalidations]);

	return result as WrapPropTreeNodeRecord<TResult>;
}

/**
 * Custom hook for using a prop tree node.
 * @public
 */
export function usePropTreeRecord<
	const T extends PropTreeNodeRecord,
	TResult extends NodeRecord,
>(
	props: T,
	f: (node: UnwrapPropTreeNodeRecord<T>) => TResult,
): WrapPropTreeNodeRecord<TResult> {
	const record = unwrapPropTreeProps(props);

	const entries = Object.entries(record).sort(([a], [b]) => (a < b ? -1 : 1)) as [
		string,
		TreeNode | TreeLeafValue | undefined,
	][];

	const keys = entries.map(([key]) => key);
	const values = entries.map(([, node]) => node);
	const invalidations = entries.map(([, node]) =>
		node instanceof TreeNode ? useTree(node) : undefined,
	);

	const result = React.useMemo(() => f(record), [f, ...keys, ...values, ...invalidations]);

	return result as WrapPropTreeNodeRecord<TResult>;
}

/**
 * Custom hook for using a prop tree node.
 * @public
 */
export function unwrapPropTreeNode<T extends TreeNode | TreeLeafValue>(
	propNode: PropTreeValue<T> | T,
): T {
	return propNode as T;
}

/**
 * Custom hook for using a prop tree node.
 * @public
 */
export function unwrapPropTreeProps<T extends PropTreeNodeRecord>(
	props: T,
): UnwrapPropTreeNodeRecord<T> {
	return props as UnwrapPropTreeNodeRecord<T>;
}

/**
 * Unwrap prop tree node.
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
export type PropTreeValue<T extends TreeNode | TreeLeafValue> = T extends TreeNode
	? PropTreeNode<T>
	: T;

/**
 * Type erase a TreeNode as a {@link PropTreeNode}.
 * @public
 */
export function toPropTreeNode<T extends TreeNode | TreeLeafValue>(node: T): PropTreeValue<T> {
	return node as unknown as PropTreeValue<T>;
}
