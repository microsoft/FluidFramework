/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { UpPath, PathVisitor } from "../../core/index.js";
import { FlexTreeNode } from "./flexTreeTypes.js";

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
 * An event raised on a {@link FlexTreeNode}.
 *
 * @internal
 */
export interface TreeEvent {
	/**
	 * The node of the tree where the listener receiving the event is attached.
	 */
	readonly target: FlexTreeNode;
}

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
	 * Raised on a node right before a change is applied to one of its fields or the fields of a descendant node.
	 *
	 * @param event - The event object. See {@link TreeEvent} for details.
	 *
	 * @remarks
	 * What exactly qualifies as a change that triggers this event (or {@link FlexTreeNodeEvents.afterChange}) is dependent
	 * on the implementation of SharedTree. In general, these events will fire once for every atomic editing operation
	 * supported by SharedTree; {@link FlexTreeNodeEvents.beforeChange} before the change is applied, and
	 * {@link FlexTreeNodeEvents.afterChange} after it is.
	 *
	 * {@link FieldKinds.sequence} fields present two exceptions:
	 *
	 * The first one is that events will fire separately for each node involved in the operation (when inserting, removing,
	 * or moving more than one node at a time). This means that, for example, when inserting two nodes into a {@link FieldKinds.sequence}
	 * field the following will happen:
	 * - {@link FlexTreeNodeEvents.beforeChange} will fire once before either new node is present in the tree.
	 * - {@link FlexTreeNodeEvents.afterChange} will fire once after the first node is present in the tree, but the second one isn't.
	 * - {@link FlexTreeNodeEvents.beforeChange} will fire once before the second node is present in the tree, but the first one already is.
	 * - {@link FlexTreeNodeEvents.afterChange} will fire once after the second node is present in the tree (so at this point both nodes are).
	 * Something similar applies to removing nodes from a sequence, and moving them to another sequence.
	 *
	 * The second one is that for an operation to move nodes, events will fire *twice* for each node being moved; once
	 * while they are being detached from their source location, and once when they are being attached at the target location.
	 */
	beforeChange(event: TreeEvent): void;

	/**
	 * Raised on a node right after a change is applied to one of its fields or the fields of a descendant node.
	 *
	 * @param event - The event object. See {@link TreeEvent} for details.
	 *
	 * @remarks
	 * What exactly qualifies as a change that triggers this event (or {@link FlexTreeNodeEvents.beforeChange}) is dependent
	 * on the implementation of SharedTree. In general, these events will fire once for every atomic editing operation supported
	 * by SharedTree; {@link FlexTreeNodeEvents.beforeChange} before the change is applied, and
	 * {@link FlexTreeNodeEvents.afterChange} after it is.
	 *
	 * {@link FieldKinds.sequence} present two exceptions:
	 *
	 * The first one is that events will fire separately for each node involved in the operation (when inserting, removing,
	 * or moving more than one node at a time). This means that, for example, when inserting two nodes into a {@link FieldKinds.sequence}
	 * field the following will happen:
	 * - {@link FlexTreeNodeEvents.beforeChange} will fire once before either new node is present in the tree.
	 * - {@link FlexTreeNodeEvents.afterChange} will fire once after the first node is present in the tree, but the second one isn't.
	 * - {@link FlexTreeNodeEvents.beforeChange} will fire once before the second node is present in the tree, but the first one already is.
	 * - {@link FlexTreeNodeEvents.afterChange} will fire once after the second node is present in the tree (so at this point both nodes are).
	 * Something similar applies to removing nodes from a sequence, and moving them to another sequence.
	 *
	 * The second one is that for an operation to move nodes, events will fire *twice* for each node being moved; once
	 * while they are being detached from their source location, and once when they are being attached at the target location.
	 */
	afterChange(event: TreeEvent): void;
}
