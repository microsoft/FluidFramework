/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../../../util";
import { TreeNodeSchema } from "../../typed-schema";
import { EditableTreeEvents } from "../../untypedTree";
import { TreeNode } from "../editableTreeTypes";
import { getProxyForNode } from "./proxies";
import { ProxyNode, SharedTreeNode, getTreeNode } from "./types";

/**
 * The `node` object holds various functions for analyzing {@link SharedTreeNode}s.
 * @alpha
 */
export const node = {
	/**
	 * The schema information for this node.
	 */
	schema: (n: SharedTreeNode) => {
		return assertTreeNode(n).schema;
	},
	/**
	 * Narrow the type of the given object if it satisfies the given schema.
	 * @example
	 * ```ts
	 * if (node.is(myNode, point)) {
	 *     const y = myNode.y; // `myNode` is now known to satisfy the `point` schema and therefore has a `y` coordinate.
	 * }
	 * ```
	 */
	is: <TSchema extends TreeNodeSchema>(u: unknown, schema: TSchema): u is ProxyNode<TSchema> => {
		return getTreeNode(u)?.is(schema) ?? false;
	},
	/**
	 * Return the node under which this node resides in the tree (or undefined if this is a root node of the tree).
	 */
	parent: (n: SharedTreeNode) => {
		const treeNode = assertTreeNode(n).parentField.parent.parent;
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
		n: SharedTreeNode,
		eventName: K,
		listener: EditableTreeEvents[K],
	) => {
		return assertTreeNode(n).on(eventName, listener);
	},
	/**
	 * Returns the {@link TreeStatus} of the given node.
	 */
	status: (n: SharedTreeNode) => {
		return assertTreeNode(n).treeStatus();
	},
};

function assertTreeNode(n: SharedTreeNode): TreeNode {
	return getTreeNode(n) ?? fail("Expected a SharedTreeNode");
}
