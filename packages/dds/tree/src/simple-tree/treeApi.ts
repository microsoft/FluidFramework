/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils";

import { TreeValue } from "../core/index.js";
import {
	LeafNodeSchema,
	Multiplicity,
	TreeStatus,
	isTreeValue,
	valueSchemaAllows,
} from "../feature-libraries/index.js";

import { getOrCreateNodeProxy, getSimpleSchema } from "./proxies.js";
import { getFlexNode, tryGetFlexNode } from "./proxyBinding.js";
import { schemaFromValue } from "./schemaFactory.js";
import { NodeFromSchema, NodeKind, TreeLeafValue, TreeNodeSchema } from "./schemaTypes.js";
import { getFlexSchema } from "./toFlexSchema.js";
import { TreeNode } from "./types.js";

/**
 * Provides various functions for analyzing {@link TreeNode}s.
 *
 * @privateRemarks
 * Inlining the typing of this interface onto the `Tree` object provides slightly different .d.ts generation,
 * which avoids typescript expanding the type of TreeNodeSchema and thus encountering
 * https://github.com/microsoft/rushstack/issues/1958.
 * @public
 */
export interface TreeNodeApi {
	/**
	 * The schema information for this node.
	 */
	schema<T extends TreeNode | TreeLeafValue>(
		node: T,
	): TreeNodeSchema<string, NodeKind, unknown, T>;

	/**
	 * Narrow the type of the given value if it satisfies the given schema.
	 * @example
	 * ```ts
	 * if (node.is(myNode, point)) {
	 *     const y = myNode.y; // `myNode` is now known to satisfy the `point` schema and therefore has a `y` coordinate.
	 * }
	 * ```
	 */
	is<TSchema extends TreeNodeSchema>(
		value: unknown,
		schema: TSchema,
	): value is NodeFromSchema<TSchema>;
	/**
	 * Return the node under which this node resides in the tree (or undefined if this is a root node of the tree).
	 */
	parent(node: TreeNode): TreeNode | undefined;

	/**
	 * The key of the given node under its parent.
	 * @remarks
	 * If `node` is an element in a {@link (TreeArrayNode:interface)}, this returns the index of `node` in the array node (a `number`).
	 * Otherwise, this returns the key of the field that it is under (a `string`).
	 */
	key(node: TreeNode): string | number;

	/**
	 * Register an event listener on the given node.
	 * @param node - The node who's events should be subscribed to.
	 * @param eventName - Which event to subscribe to.
	 * @param listener - The callback to trigger for the event. The tree can be read during the callback, but it is invalid to modify the tree during this callback.
	 * @returns A callback function which will deregister the event.
	 * This callback should be called only once.
	 */
	on<K extends keyof TreeChangeEvents>(
		node: TreeNode,
		eventName: K,
		listener: TreeChangeEvents[K],
	): () => void;

	/**
	 * Returns the {@link TreeStatus} of the given node.
	 */
	readonly status: (node: TreeNode) => TreeStatus;
}

/**
 * The `Tree` object holds various functions for analyzing {@link TreeNode}s.
 */
export const treeNodeApi: TreeNodeApi = {
	parent: (node: TreeNode): TreeNode | undefined => {
		const editNode = getFlexNode(node).parentField.parent.parent;
		if (editNode === undefined) {
			return undefined;
		}

		const output = getOrCreateNodeProxy(editNode);
		assert(
			!isTreeValue(output),
			0x87f /* Parent can't be a leaf, so it should be a node not a value */,
		);
		return output;
	},
	key: (node: TreeNode) => {
		const parentField = getFlexNode(node).parentField;
		if (parentField.parent.schema.kind.multiplicity === Multiplicity.Sequence) {
			// The parent of `node` is an array node
			return parentField.index;
		}

		// The parent of `node` is an object, a map, or undefined (and therefore `node` is a root/detached node).
		return parentField.parent.key;
	},
	on: <K extends keyof TreeChangeEvents>(
		node: TreeNode,
		eventName: K,
		listener: TreeChangeEvents[K],
	) => {
		const flex = getFlexNode(node);
		const anchor = flex.anchorNode;

		switch (eventName) {
			case "afterShallowChange": {
				// The funky pattern subscribing to two events from the anchors is so we can fire afterShallowChange once,
				// batching changes to several fields of the node. 'childrenChanged' on the anchor fires on every change to
				// a field so doesn't allow us to batch.
				let shouldFireShallowChange = false;
				const unsubscribeFromChildrenChanged = anchor.on(
					"childrenChanged",
					() => (shouldFireShallowChange = true),
				);
				const unsubscribeFromSubtreeChanged = anchor.on("subtreeChanged", () => {
					if (shouldFireShallowChange) {
						listener();
						shouldFireShallowChange = false;
					}
				});

				return () => {
					unsubscribeFromChildrenChanged();
					unsubscribeFromSubtreeChanged();
				};
			}
			case "afterDeepChange":
				return anchor.on("subtreeChanged", () => listener());
			default:
				return unreachableCase(eventName);
		}
	},
	status: (node: TreeNode) => {
		return getFlexNode(node, true).treeStatus();
	},
	is: <TSchema extends TreeNodeSchema>(
		value: unknown,
		schema: TSchema,
	): value is NodeFromSchema<TSchema> => {
		const flexSchema = getFlexSchema(schema);
		if (isTreeValue(value)) {
			return (
				flexSchema instanceof LeafNodeSchema && valueSchemaAllows(flexSchema.info, value)
			);
		}
		return tryGetFlexNode(value)?.is(flexSchema) ?? false;
	},
	schema<T extends TreeNode | TreeValue>(node: T): TreeNodeSchema<string, NodeKind, unknown, T> {
		if (isTreeValue(node)) {
			return schemaFromValue(node) as TreeNodeSchema<string, NodeKind, unknown, T>;
		}
		return getSimpleSchema(getFlexNode(node).schema) as TreeNodeSchema<
			string,
			NodeKind,
			unknown,
			T
		>;
	},
};

/**
 * A collection of events that can be raised by a {@link TreeNode}.
 *
 * @privateRemarks
 * TODO: add a way to subscribe to a specific field (for afterShallowChange and afterDeepChange).
 * Probably have object node and map node specific APIs for this.
 *
 * TODO: ensure that subscription API for fields aligns with API for subscribing to the root.
 *
 * TODO: add more wider area (avoid needing tons of afterShallowChange registration) events for use-cases other than afterDeepChange.
 * Some ideas:
 *
 * - afterDeepChange, but with some subtrees/fields/paths excluded
 * - helper to batch several afterShallowChange calls to a afterDeepChange scope
 * - parent change (ex: registration on the parent field for a specific index: maybe allow it for a range. Ex: node event takes optional field and optional index range?)
 * - new content inserted into subtree. Either provide event for this and/or enough info to afterDeepChange to find and search the new sub-trees.
 * Add separate (non event related) API to efficiently scan tree for given set of types (using low level cursor and schema based filtering)
 * to allow efficiently searching for new content (and initial content) of a given type.
 *
 * @public
 */
export interface TreeChangeEvents {
	/**
	 * Raised on a node when one or more of its child nodes are replaced, i.e. when the properties of the node are
	 * assigned to (this includes assigning `undefined` to a property to remove the child node there).
	 *
	 * @remarks
	 * In particular, this event is not raised when:
	 * - Properties of a child node change. Notably, updates to an array node or a map node (like adding or removing
	 * elements/entries) will raise this event on the array/map node itself, but not on the node that contains the
	 * array/map node as one of its properties.
	 * - The node is moved to a different location in the tree or removed from the tree.
	 * In this case the event is raised on the _parent_ node, not the node itself.
	 *
	 * Also note that value nodes do not have properties (child nodes), so this event is never raised for them.
	 *
	 * For remote edits, this event is not guaranteed to occur in the same order or quantity that it did in
	 * the client that made the original edit.
	 * While a batch of edits will as a whole update the tree to the appropriate end state, no guarantees are made about
	 * how many times this event will be raised during any intermediate states.
	 * When it is raised, the tree is guaranteed to be in-schema.
	 *
	 * @privateRemarks
	 * In terms of the internal implementation of tree, this fires when:
	 * - The content of one or more of the node's fields changes (i.e., the field now contains a new node, or nothing if it
	 * previously contained a node)
	 * - For an array node, when the array is modified (i.e., an element is added, removed, or moved)
	 * - For a map node, when a key is added, updated, or removed.
	 *
	 * This event occurs whenever the apparent contents of the node instance change, regardless of what caused the change.
	 * For example, it will fire when the local client reassigns a child, when part of a remote edit is applied to the
	 * node, or when the node has to be updated due to resolution of a merge conflict
	 * (for example a previously applied local change might be undone, then reapplied differently or not at all).
	 */
	afterShallowChange(): void;

	/**
	 * Raised on a node when changes happen anywhere in the subtree (including itself) rooted at it.
	 *
	 * @remarks
	 * This event is not raised when the node itself is moved to a different location in the tree or removed from the tree.
	 *
	 * It may fire at a time when the change(s) that triggered it are not yet visible if the listener inspects the tree.
	 * In that case, it is guaranteed to fire again after the change(s) _are_ visible to the listener.
	 *
	 * Also note that value nodes do not have properties (child nodes), so this event is never raised for them.
	 *
	 * For remote edits, this event is not guaranteed to occur in the same order or quantity that it did in
	 * the client that made the original edit.
	 * While a batch of edits will as a whole update the tree to the appropriate end state, no guarantees are made about
	 * how many times this event will be raised during any intermediate states.
	 * When it is raised, the tree is guaranteed to be in-schema.
	 */
	afterDeepChange(): void;
}
