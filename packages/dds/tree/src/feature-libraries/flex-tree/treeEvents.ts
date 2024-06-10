/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AnchorNode, PathVisitor, UpPath } from "../../core/index.js";
import { Off } from "../../events/index.js";

/**
 * This file provides an API for working with trees which is type safe even when schema is not known.
 * This means no editing is allowed.
 *
 * Schema aware APIs for working with trees should superset this, while sub-setting FlexTree.
 *
 * TODO:
 * This API should replace FlexTree as the default public API for tree access.
 * SchemaAware builds on this, adding editing and type safe APIs which can be accessed via SchematizeView.
 * Once this is finished, the unsafe FlexTree types can be removed (or converted to package internal documentation for the proxies).
 */

/**
 * A collection of events that can be raised by a {@link FlexTreeNode}.
 * These events are triggered while the internal data structures are being updated.
 * Thus these events must not trigger reading of the anchorSet or forest.
 *
 * TODO:
 * - Design how events should be ordered.
 * - Include sub-deltas in events.
 * - Add more events.
 * - Have some events (or a way to defer events) until the tree can be read.
 * - Consider removing this and just using AnchorEvents and simple-tree's events (and extending them as needed).
 *
 * @internal
 */
export interface FlexTreeNodeEvents {
	/**
	 * Raised when a specific FlexTree node is changing.
	 * This includes its fields.
	 * @param upPath - the path corresponding to the location of the node being changed, upward.
	 */
	changing(upPath: UpPath): void;

	/**
	 * Raised when something in the tree is changing, including this node and its descendants.
	 * The event can optionally return a {@link PathVisitor} to traverse the subtree
	 * This event is called on every parent (transitively) when a change is occurring.
	 * Includes changes to this node itself.
	 * @param upPath - the path corresponding to the location of the node being changed, upward.
	 * @returns a visitor to traverse the subtree or `void`.
	 */
	subtreeChanging(upPath: UpPath): PathVisitor | void;

	/**
	 * This has the same contract as {@link TreeChangeEvents.nodeChanged}
	 */
	nodeChanged(): void;

	/**
	 * This has the same contract as {@link TreeChangeEvents.treeChanged}
	 */
	treeChanged(): void;
}

/**
 * Subscribe to changes to the node for the given {@link AnchorNode}.
 * @remarks This fulfills the contract of {@link TreeChangeEvents.nodeChanged}.
 * @privateRemarks The logic in this function ensures that the listener is only fired once per change per node.
 */
export function onNodeChanged(
	anchorNode: AnchorNode,
	listener: FlexTreeNodeEvents["nodeChanged"],
): Off {
	// Debounce "childrenChanged" (which fires separately for each field that changed in the node)
	// by waiting for "subtreeChanged" (which only fires once regardless of how many fields changed).
	let unsubscribeFromTreeChanged: (() => void) | undefined;
	// Every time that "childrenChanged" fires...
	return anchorNode.on("childrenChanged", () => {
		// ...subscribe to "subtreeChanged", but only if we haven't subscribed already already since the last time it fired
		if (unsubscribeFromTreeChanged === undefined) {
			unsubscribeFromTreeChanged = anchorNode.on("subtreeChanged", () => {
				listener();
				unsubscribeFromTreeChanged?.();
				unsubscribeFromTreeChanged = undefined;
			});
		}
	});
}

/**
 * Subscribe to changes to the tree rooted at the given {@link AnchorNode}.
 * @remarks This fulfills the contract of {@link TreeChangeEvents.treeChanged}.
 */
export function onTreeChanged(
	anchorNode: AnchorNode,
	listener: FlexTreeNodeEvents["treeChanged"],
): Off {
	return anchorNode.on("subtreeChanged", listener);
}
