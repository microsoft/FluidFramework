/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../../../util";
import { TreeNodeSchema } from "../../typed-schema";
import { EditableTreeEvents } from "../../untypedTree";
import { TreeNode, TreeStatus } from "../editableTreeTypes";
import { getProxyForNode } from "./proxies";
import { ProxyNode, SharedTreeNode, getTreeNode } from "./types";

/**
 * Provides various functions for analyzing {@link SharedTreeNode}s.
 * @alpha
 * @privateRemarks
 * Inlining the typing of this interface onto the `node` object provides slightly different .d.ts generation,
 * which avoids typescript expanding the type of TreeNodeSchema and thus encountering
 * https://github.com/microsoft/rushstack/issues/1958.
 */
export interface NodeApi {
	/**
	 * The schema information for this node.
	 */
	readonly schema: (node: SharedTreeNode) => TreeNodeSchema;
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
	) => value is ProxyNode<TSchema>;
	/**
	 * Return the node under which this node resides in the tree (or undefined if this is a root node of the tree).
	 */
	readonly parent: (node: SharedTreeNode) => SharedTreeNode | undefined;
	/**
	 * The key of the given node under its parent.
	 * @remarks
	 * * If `node` is under an object, this returns the key of the field that is under (a string).
	 * * If `node` is under a list, this returns the index of `node` in the list (a number).
	 * * If `node` is the root of the tree, returns a special key (a string).
	 */
	readonly key: (node: SharedTreeNode) => string | number;
	/**
	 * Register an event listener on the given node.
	 * @returns A callback function which will deregister the event.
	 * This callback should be called only once.
	 */
	readonly on: <K extends keyof EditableTreeEvents>(
		node: SharedTreeNode,
		eventName: K,
		listener: EditableTreeEvents[K],
	) => () => void;
	/**
	 * Returns the {@link TreeStatus} of the given node.
	 */
	readonly status: (node: SharedTreeNode) => TreeStatus;
}

/**
 * The `node` object holds various functions for analyzing {@link SharedTreeNode}s.
 * @alpha
 */
export const nodeAPi: NodeApi = {
	schema: (node: SharedTreeNode): TreeNodeSchema => {
		return assertTreeNode(node).schema;
	},
	is: <TSchema extends TreeNodeSchema>(
		value: unknown,
		schema: TSchema,
	): value is ProxyNode<TSchema> => {
		return getTreeNode(value)?.is(schema) ?? false;
	},
	parent: (node: SharedTreeNode) => {
		const treeNode = assertTreeNode(node).parentField.parent.parent;
		if (treeNode !== undefined) {
			return getProxyForNode(treeNode);
		}

		return undefined;
	},
	key: (node: SharedTreeNode) => {
		const x = 
	},
	on: <K extends keyof EditableTreeEvents>(
		node: SharedTreeNode,
		eventName: K,
		listener: EditableTreeEvents[K],
	) => {
		return assertTreeNode(node).on(eventName, listener);
	},
	status: (node: SharedTreeNode) => {
		return assertTreeNode(node).treeStatus();
	},
};

function assertTreeNode(node: SharedTreeNode): TreeNode {
	return getTreeNode(node) ?? fail("Expected a SharedTreeNode");
}
