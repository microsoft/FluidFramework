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

interface Subscriptions {
	/**
	 * If defined, still needs to be called at some point.
	 * @remarks
	 * Clear when called.
	 */
	unsubscribe?: () => void;
}

/**
 * Wrapper around subscriptions to give it an object identity which can be used with FinalizationRegistry.
 * @remarks
 * This indirection is need so inner can be provided to finalizationRegistry as the heldValue and avoid having that cause a leak.
 * @privateRemarks
 * This is a named class to make looking for leaks of it in heap snapshots easier.
 */
class SubscriptionsWrapper {
	public readonly inner: Subscriptions = {};
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
 * Options for {@link useTreeObservations}.
 * @input
 * @public
 */
export interface ObservationOptions {
	/**
	 * Called when the tracked tree observations are invalidated.
	 * This is not expected to have production use cases, but it useful for testing and debugging.
	 */
	onInvalidation?: () => void;
}

/**
 * Custom hook which invalidates a React Component when there is a change in tree content observed during `trackDuring`.
 *
 * @param trackDuring - Called synchronously, and will have its tree observations tracked.
 * @param onInvalidation - Called when the tracked tree observations are invalidated.
 * This is not expected to have production use cases, but it useful for testing and debugging.
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
	// Use a React state hook to invalidate this component some aspect of a tree that `trackDuring` observed changes.

	const [subscriptions, setSubscriptions] = React.useState<SubscriptionsWrapper>(
		new SubscriptionsWrapper(),
	);

	// Because `subscriptions` is used in `finalizationRegistry` for cleanup, it is important that nothing save a reference to it which is retained by the invalidation callback.
	// TO help with this, pull out `inner` so it can be closed over without retaining `subscriptions`.
	const inner = subscriptions.inner;

	const invalidate = (): void => {
		// Since below uses trackObservationsOnce, the un-subscription is done before calling this callback,
		// and therefore this must ensure that no further un-subscriptions occur, as well as that the render is invalidated.
		//
		// Note referencing `setSubscriptions` here will hold onto if React's implementation of `setSubscriptions`:
		// if that holds onto `subscriptions` it would cause a leak (by preventing finalizationRegistry from running and thus preventing un-subscription after unmount).
		// Experimentally this has been observed not to be the case.
		setSubscriptions(new SubscriptionsWrapper());

		// This cannot do `registry.unregister(subscriptions);` as that would cause a leak by holding onto `subscriptions`
		// since this closure is held onto by the subscribed events.
		// Skipping such an un-registration is fine so long as we ensure the registry does not redundantly unsubscribe.
		// Since trackObservationsOnce already unsubscribed, just clear out the unsubscribe function to ensure it is not called again by the finalizer.
		inner.unsubscribe = undefined;

		options?.onInvalidation?.();
	};

	// If there was a previous rendering of this instance of this hook in the current component, unsubscribe from it.
	// This avoids a memory leak (of the event subscriptions) in the case where a components is rerendered.
	inner.unsubscribe?.();
	inner.unsubscribe = undefined;

	// This is logically pure other than the sideeffect of registering for invalidation if the observed content changes.
	// This is safe from a React perspective since when the observed content changes, that is reflected in the `useState` above.
	// What is more problematic is avoiding of leaking the event registrations since React does not provide an easy way to do that for code run outside of a hook.
	// That leak is avoided via two separate approaches: the un-subscription for events from previous renders above,
	// and the use of finalizationRegistry below to handle the component unmount case.
	const out = TreeAlpha.trackObservationsOnce(invalidate, trackDuring);

	inner.unsubscribe = out.unsubscribe;

	// There is still the issue of unsubscribing when the component unmounts.
	// This can almost be done using a React effect hook with an empty dependency list.
	// Unfortunately that would have a hard time getting the correct subscriptions to unsubscribe,
	// and if run before unmount, like in StrictMode, it would cause an invalidation bug.
	// Suppressing that invalidation bug with aan extra call to setSubscriptions could work, but would produce incorrect warnings about leaks,
	// and might cause infinite rerender depending on how StrictMode works.
	// Such an Effect would look like this:
	// React.useEffect(
	// 	() => () => {
	// 		subscriptions.unsubscribe?.();
	// 		subscriptions.unsubscribe = undefined;
	// 		setSubscriptions({});
	// 	},
	// 	[],
	// );
	// Instead of that, use a FinalizationRegistry to clean up when the subscriptions.
	// As this only needs to run sometime after the component is unmounted, triggering it based on React no longer holding onto the subscriptions state object is sufficient.
	// This should be safe (not unsubscribe too early) as React will hold onto the state object for as long as the component is mounted since if the component rerenders, it will be required.
	// If React decided it would never reuse the component instance (recreate it instead of rerender) but kept it mounted, then it would be possible for this to unsubscribe too early.
	// Currently however, it does not seem like React does or will do that.
	// If such an issue does ever occur, it could be fixed by stuffing a reference to the `subscriptions` object in the DOM: for now such a mitigation appears unnecessary and would add overhead.
	finalizationRegistry.register(subscriptions, inner);

	return out.result;
}

/**
 * Handles unsubscribing from events when the {@link SubscriptionsWrapper} is garbage collected.
 * See comments in {@link useTreeObservations} for details.
 */
const finalizationRegistry = new FinalizationRegistry((subscriptions: Subscriptions) => {
	subscriptions.unsubscribe?.();
	// Clear out the unsubscribe function to ensure it is not called again.
	// This should not be needed, but maintains the invariant that unsubscribe should be removed after being called.
	subscriptions.unsubscribe = undefined;
});

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
