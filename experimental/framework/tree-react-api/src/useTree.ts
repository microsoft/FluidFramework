/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { TreeLeafValue, TreeNode } from "@fluidframework/tree";
import { Tree } from "@fluidframework/tree";
import { TreeAlpha } from "@fluidframework/tree/internal";
import * as React from "react";

import {
	unwrapPropTreeNode,
	unwrapPropTreeRecord,
	type PropTreeNodeRecord,
	type PropTreeValue,
	type UnwrapPropTreeNodeRecord,
	type WrapNodes,
} from "./propNode.js";
import { useObservation, type ObservationOptions } from "./useObservation.js";

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
 * Higher order component which wraps a component to use {@link useTreeObservations}.
 *
 * @remarks
 * When passing TreeNodes in props, care must be taken to not observe their content outside of a context which does observation tracking (or manual invalidation).
 * This wraps a component in such tracking.
 *
 * It is recommended that sub-components which take in TreeNodes, if not defined using this higher order components, take the nodes in as {@link PropTreeNode}s.
 * Components defined using this higher order component can take in either raw TreeNodes or {@link PropTreeNode}s: the latter will be automatically unwrapped.
 * @privateRemarks
 * `React.FC` does not seem to be covariant over its input type, so to make use of this more ergonomic,
 * the return type intersects the various ways this could be used (with or without PropTreeNode wrapping).
 * @public
 */
export function withTreeObservations<TIn>(
	component: React.FC<TIn>,
	options?: ObservationOptions,
): React.FC<TIn> & React.FC<WrapNodes<TIn>> & React.FC<TIn | WrapNodes<TIn>> {
	return (props: TIn | WrapNodes<TIn>): React.ReactNode =>
		useTreeObservations(() => component(props as TIn), options);
}

/**
 * {@link withTreeObservations} wrapped with React.memo.
 * @remarks
 * There is no special logic here, just a convenience wrapper.
 * @public
 */
export function withMemoizedTreeObservations<TIn>(
	component: React.FC<TIn>,
	options?: ObservationOptions & {
		readonly propsAreEqual?: Parameters<typeof React.memo>[1];
	},
): React.MemoExoticComponent<ReturnType<typeof withTreeObservations<TIn>>> {
	return React.memo(withTreeObservations(component, options), options?.propsAreEqual);
}

/**
 * Custom hook which invalidates a React Component when there is a change in tree content observed during `trackDuring`.
 *
 * @param trackDuring - Called synchronously, and will have its tree observations tracked.
 *
 * @remarks
 * This includes changes to the tree's content.
 * Currently this will throw if observing a node's parentage to be undefined,
 * and node status changes will not cause invalidation.
 *
 * For additional type safety to help avoid observing TreeNode content outside of this hook, see {@link PropTreeNode}.
 * @public
 */
export function useTreeObservations<TResult>(
	trackDuring: () => TResult,
	options?: ObservationOptions,
): TResult {
	return useObservation(
		(invalidate) => TreeAlpha.trackObservationsOnce(invalidate, trackDuring),
		options,
	);
}

/**
 * Custom hook for using a prop tree node.
 *
 * @param propNode - Input, automatically unwrapped TreeNode from a {@link PropTreeNode} if needed.
 * @param trackDuring - Callback which reads from the node and returns a result.
 * If the result is a TreeNode or {@link NodeRecord} it will be wrapped as a {@link PropTreeNode} or {@link PropTreeNodeRecord}, see {@link WrapNodes}.
 *
 * It is recommended that when returning data containing TreeNodes,
 * use a format supported by {@link WrapNodes} or wrap the nodes manually using {@link toPropTreeNode}.
 * This improves the type safety, reducing the risk of invalidation bugs due to untracked access of tree content contained in the return value.
 *
 * Note that is is fine to observe any node inside the callback, not just the provided node: all accesses will be tracked.
 * The input node is just provided as a way to automatically unwrap the {@link PropTreeNode}
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
