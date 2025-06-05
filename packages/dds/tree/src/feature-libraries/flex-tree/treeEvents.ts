/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { UpPath } from "../../core/index.js";

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
	 * This event is called on every parent (transitively) when a change is occurring.
	 * Includes changes to this node itself.
	 * @param upPath - the path corresponding to the location of the node being changed, upward.
	 */
	subtreeChanging(upPath: UpPath): void;

	/**
	 * This has the same contract as {@link TreeChangeEvents.nodeChanged}
	 */
	nodeChanged(): void;

	/**
	 * This has the same contract as {@link TreeChangeEvents.treeChanged}
	 */
	treeChanged(): void;
}
