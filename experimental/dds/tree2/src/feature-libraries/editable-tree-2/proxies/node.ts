/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Assume, fail } from "../../../util";
import { TreeNodeSchema } from "../../typed-schema";
import { EditableTreeEvents } from "../../untypedTree";
import { TreeNode, TreeStatus } from "../editableTreeTypes";
import { getProxyForNode } from "./proxies";
import { ProxyNode, SharedTreeNode, getTreeNode } from "./types";

/**
 * The `node` object holds various functions for analyzing {@link SharedTreeNode}s.
 * @alpha
 */
export const nodeAPi = {
	/**
	 * The schema information for this node.
	 */
	schema: (node: SharedTreeNode): TreeNodeSchema => {
		return assertTreeNode(node).schema;
	},
	/**
	 * Narrow the type of the given value if it satisfies the given schema.
	 * @example
	 * ```ts
	 * if (node.is(myNode, point)) {
	 *     const y = myNode.y; // `myNode` is now known to satisfy the `point` schema and therefore has a `y` coordinate.
	 * }
	 * ```
	 */
	// TODO: Fix this type mess after we understand why API-extractor is non-deterministic here. TSchema should extend "TreeNodeSchema".
	is: <TSchema>(
		value: unknown,
		schema: TSchema,
	): value is ProxyNode<Assume<TSchema, TreeNodeSchema>> => {
		return getTreeNode(value)?.is(schema as any) ?? false;
	},
	/**
	 * Return the node under which this node resides in the tree (or undefined if this is a root node of the tree).
	 */
	parent: (node: SharedTreeNode): SharedTreeNode | undefined => {
		const treeNode = assertTreeNode(node).parentField.parent.parent;
		if (treeNode !== undefined) {
			return getProxyForNode(treeNode);
		}

		return undefined;
	},
	/**
	 * Register an event listener on the given node.
	 * @returns A callback function which will deregister the event.
	 * This callback should be called only once.
	 */
	on: <K extends keyof EditableTreeEvents>(
		node: SharedTreeNode,
		eventName: K,
		listener: EditableTreeEvents[K],
	): (() => void) => {
		return assertTreeNode(node).on(eventName, listener);
	},
	/**
	 * Returns the {@link TreeStatus} of the given node.
	 */
	status: (node: SharedTreeNode): TreeStatus => {
		return assertTreeNode(node).treeStatus();
	},
};

function assertTreeNode(node: SharedTreeNode): TreeNode {
	return getTreeNode(node) ?? fail("Expected a SharedTreeNode");
}
