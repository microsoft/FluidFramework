/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * A collection of events that can be emitted by a {@link TreeNode}.
 *
 * @privateRemarks
 * TODO: add a way to subscribe to a specific field (for nodeChanged and treeChanged).
 * Probably have object node and map node specific APIs for this.
 *
 * TODO: ensure that subscription API for fields aligns with API for subscribing to the root.
 *
 * TODO: add more wider area (avoid needing tons of nodeChanged registration) events for use-cases other than treeChanged.
 * Some ideas:
 *
 * - treeChanged, but with some subtrees/fields/paths excluded
 * - helper to batch several nodeChanged calls to a treeChanged scope
 * - parent change (ex: registration on the parent field for a specific index: maybe allow it for a range. Ex: node event takes optional field and optional index range?)
 * - new content inserted into subtree. Either provide event for this and/or enough info to treeChanged to find and search the new sub-trees.
 * Add separate (non event related) API to efficiently scan tree for given set of types (using low level cursor and schema based filtering)
 * to allow efficiently searching for new content (and initial content) of a given type.
 *
 * @sealed @public
 */

export interface TreeChangeEvents {
	/**
	 * Emitted by a node after a batch of changes has been applied to the tree, if any of the changes affected the node.
	 *
	 * - Object nodes define a change as being when the value of one of its properties changes (i.e., the property's value is set, including when set to `undefined`).
	 *
	 * - Array nodes define a change as when an element is added, removed, moved or replaced.
	 *
	 * - Map nodes define a change as when an entry is added, updated, or removed.
	 *
	 * @param unstable - Future versions of this API (such as the one in beta on TreeBeta) may use this argument to provide additional data to the event.
	 * users of this event should ensure that they do not provide a listener callback which has an optional parameter in this position, since unexpected data might get provided to it.
	 * This parameter exists to capture this fact in the type system.
	 * Using an inline lambda expression as the listener callback is a good pattern to avoid cases like this were arguments are added from breaking due to optional arguments.
	 *
	 * @remarks
	 * This event is not emitted when:
	 *
	 * - Properties of a child node change. Notably, updates to an array node or a map node (like adding or removing
	 * elements/entries) will emit this event on the array/map node itself, but not on the node that contains the
	 * array/map node as one of its properties.
	 *
	 * - The node is moved to a different location in the tree or removed from the tree.
	 * In this case the event is emitted on the _parent_ node, not the node itself.
	 *
	 * For remote edits, this event is not guaranteed to occur in the same order or quantity that it did in
	 * the client that made the original edit.
	 *
	 * When the event is emitted, the tree is guaranteed to be in-schema.
	 *
	 * @privateRemarks
	 * This event occurs whenever the apparent contents of the node instance change, regardless of what caused the change.
	 * For example, it will fire when the local client reassigns a child, when part of a remote edit is applied to the
	 * node, or when the node has to be updated due to resolution of a merge conflict
	 * (for example a previously applied local change might be undone, then reapplied differently or not at all).
	 *
	 * TODO: define and document event ordering (ex: bottom up, with nodeChanged before treeChange on each level).
	 */
	nodeChanged(unstable?: unknown): void;

	/**
	 * Emitted by a node after a batch of changes has been applied to the tree, when something changed anywhere in the
	 * subtree rooted at it.
	 *
	 * @remarks
	 * This event is not emitted when the node itself is moved to a different location in the tree or removed from the tree.
	 * In that case it is emitted on the _parent_ node, not the node itself.
	 *
	 * The node itself is part of the subtree, so this event will be emitted even if the only changes are to the properties
	 * of the node itself.
	 *
	 * For remote edits, this event is not guaranteed to occur in the same order or quantity that it did in
	 * the client that made the original edit.
	 *
	 * When it is emitted, the tree is guaranteed to be in-schema.
	 */
	treeChanged(): void;
}
