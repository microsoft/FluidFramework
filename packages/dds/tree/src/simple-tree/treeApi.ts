/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert, unreachableCase } from "@fluidframework/core-utils/internal";

import { TreeValue, Multiplicity } from "../core/index.js";
import {
	FieldKinds,
	LeafNodeSchema,
	TreeStatus,
	isTreeValue,
	valueSchemaAllows,
} from "../feature-libraries/index.js";

import { getOrCreateNodeProxy } from "./proxies.js";
import { getFlexNode, tryGetFlexNode } from "./proxyBinding.js";
import { tryGetSimpleNodeSchema } from "./schemaCaching.js";
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
	 * @param node - The node whose events should be subscribed to.
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

	/**
	 * Returns the {@link LocalNodeKey} of the given node if the identifier field kind exists.
	 * Otherwise returns undefined.
	 */
	shortID(node: TreeNode): number | undefined;
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
			case "nodeChanged": {
				let unsubscribeFromTreeChanged: (() => void) | undefined;
				return anchor.on("childrenChanged", () => {
					if (unsubscribeFromTreeChanged === undefined) {
						unsubscribeFromTreeChanged = anchor.on("subtreeChanged", () => {
							listener();
							unsubscribeFromTreeChanged?.();
							unsubscribeFromTreeChanged = undefined;
						});
					}
				});
			}
			case "treeChanged":
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
		return tryGetSimpleNodeSchema(getFlexNode(node).schema) as TreeNodeSchema<
			string,
			NodeKind,
			unknown,
			T
		>;
	},
	shortID(node: TreeNode): number | undefined {
		const flexNode = getFlexNode(node);
		for (const field of flexNode.boxedIterator()) {
			if (field.schema.kind === FieldKinds.identifier) {
				for (const child of field.boxedIterator()) {
					return Number(child.value);
				}
			}
		}
		return;
	},
};

/**
 * A collection of events that can be raised by a {@link TreeNode}.
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
 * @public
 */
export interface TreeChangeEvents {
	/**
	 * Emitted by a node when a batch of changes is applied to it, where a change is:
	 *
	 * - For an object node, when the value of one of its properties changes (i.e., the property's value is set
	 * to something else, including `undefined`).
	 *
	 * - For an array node, when an element is added, removed, or moved.
	 *
	 * - For a map node, when an entry is added, updated, or removed.
	 *
	 * @remarks
	 * This event is not raised when:
	 *
	 * - Properties of a child node change. Notably, updates to an array node or a map node (like adding or removing
	 * elements/entries) will raise this event on the array/map node itself, but not on the node that contains the
	 * array/map node as one of its properties.
	 *
	 * - The node is moved to a different location in the tree or removed from the tree.
	 * In this case the event is raised on the _parent_ node, not the node itself.
	 *
	 * For remote edits, this event is not guaranteed to occur in the same order or quantity that it did in
	 * the client that made the original edit.
	 * While a batch of edits will as a whole update the tree to the appropriate end state, no guarantees are made about
	 * how many times this event will be raised during any intermediate states.
	 * When it is raised, the tree is guaranteed to be in-schema.
	 *
	 * @privateRemarks
	 * This event occurs whenever the apparent contents of the node instance change, regardless of what caused the change.
	 * For example, it will fire when the local client reassigns a child, when part of a remote edit is applied to the
	 * node, or when the node has to be updated due to resolution of a merge conflict
	 * (for example a previously applied local change might be undone, then reapplied differently or not at all).
	 */
	nodeChanged(): void;

	/**
	 * Emitted by a node when something _may_ have changed anywhere in the subtree rooted at it.
	 *
	 * @remarks
	 * This event is guaranteed to be emitted whenever the subtree _has_ changed.
	 * However, it might also be emitted when the subtree has no visible changes compared to before the event firing.
	 *
	 * Consumers of this event have the guarantee that they won't miss any changes, but should also handle the scenario
	 * where the event fires with no visible changes as well.
	 *
	 * This event is not raised when the node itself is moved to a different location in the tree or removed from the tree.
	 * In that case it is raised on the _parent_ node, not the node itself.
	 *
	 * The node itself is part of the subtree, so this event will be emitted even if the only changes are to the properties
	 * of the node itself.
	 *
	 * For remote edits, this event is not guaranteed to occur in the same order or quantity that it did in
	 * the client that made the original edit.
	 * While a batch of edits will as a whole update the tree to the appropriate end state, no guarantees are made about
	 * how many times this event will be raised during any intermediate states.
	 * When it is raised, the tree is guaranteed to be in-schema.
	 */
	treeChanged(): void;
}
