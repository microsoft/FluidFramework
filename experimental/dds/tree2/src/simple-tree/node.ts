/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	TreeNodeSchema,
	schemaIsFieldNode,
	EditableTreeEvents,
	TreeStatus,
} from "../feature-libraries";
import { getOrCreateNodeProxy } from "./proxies";
import { getEditNode, tryGetEditNode } from "./editNode";
import { TypedNode, TreeNode } from "./types";

/**
 * Provides various functions for analyzing {@link TreeNode}s.
 * @alpha
 * @privateRemarks
 * Inlining the typing of this interface onto the `Tree` object provides slightly different .d.ts generation,
 * which avoids typescript expanding the type of TreeNodeSchema and thus encountering
 * https://github.com/microsoft/rushstack/issues/1958.
 */
export interface TreeApi {
	/**
	 * The schema information for this node.
	 */
	readonly schema: (node: TreeNode) => TreeNodeSchema;
	/**
	 * Narrow the type of the given value if it satisfies the given schema.
	 * @example
	 * ```ts
	 * if (node.is(myNode, point)) {
	 *     const y = myNode.y; // `myNode` is now known to satisfy the `point` schema and therefore has a `y` coordinate.
	 * }
	 * ```
	 */
	readonly is: <TSchema extends TreeNodeSchema>(
		value: unknown,
		schema: TSchema,
	) => value is TypedNode<TSchema>;
	/**
	 * Return the node under which this node resides in the tree (or undefined if this is a root node of the tree).
	 */
	readonly parent: (node: TreeNode) => TreeNode | undefined;
	/**
	 * The key of the given node under its parent.
	 * @remarks
	 * If `node` is an element in a {@link (TreeListNode:interface)}, this returns the index of `node` in the list (a `number`).
	 * Otherwise, this returns the key of the field that it is under (a `string`).
	 */
	readonly key: (node: TreeNode) => string | number;
	/**
	 * Register an event listener on the given node.
	 * @returns A callback function which will deregister the event.
	 * This callback should be called only once.
	 */
	readonly on: <K extends keyof EditableTreeEvents>(
		node: TreeNode,
		eventName: K,
		listener: EditableTreeEvents[K],
	) => () => void;
	/**
	 * Returns the {@link TreeStatus} of the given node.
	 */
	readonly status: (node: TreeNode) => TreeStatus;
}

/**
 * The `Tree` object holds various functions for analyzing {@link TreeNode}s.
 * @alpha
 */
export const nodeApi: TreeApi = {
	schema: (node: TreeNode) => {
		return getEditNode(node).schema;
	},
	is: <TSchema extends TreeNodeSchema>(
		value: unknown,
		schema: TSchema,
	): value is TypedNode<TSchema> => {
		return tryGetEditNode(value)?.is(schema) ?? false;
	},
	parent: (node: TreeNode) => {
		const editNode = getEditNode(node).parentField.parent.parent;
		if (editNode !== undefined) {
			return getOrCreateNodeProxy(editNode);
		}

		return undefined;
	},
	key: (node: TreeNode) => {
		const editNode = getEditNode(node);
		const parent = nodeApi.parent(node);
		if (parent !== undefined) {
			const parentSchema = nodeApi.schema(parent);
			if (schemaIsFieldNode(parentSchema)) {
				// The parent of `node` is a list
				return editNode.parentField.index;
			}
		}

		// The parent of `node` is an object, a map, or undefined (and therefore `node` is a root/detached node).
		return editNode.parentField.parent.key;
	},
	on: <K extends keyof EditableTreeEvents>(
		node: TreeNode,
		eventName: K,
		listener: EditableTreeEvents[K],
	) => {
		return getEditNode(node).on(eventName, listener);
	},
	status: (node: TreeNode) => {
		return getEditNode(node).treeStatus();
	},
};
