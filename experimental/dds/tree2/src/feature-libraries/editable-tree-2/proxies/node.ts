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
	schema: (node: SharedTreeNode) => TreeNodeSchema;
	/**
	 * Narrow the type of the given value if it satisfies the given schema.
	 * @example
	 * ```ts
	 * if (node.is(myNode, point)) {
	 *     const y = myNode.y; // `myNode` is now known to satisfy the `point` schema and therefore has a `y` coordinate.
	 * }
	 * ```
	 */
	is: <TSchema extends TreeNodeSchema>(
		value: unknown,
		schema: TSchema,
	) => value is ProxyNode<TSchema>;
	/**
	 * Return the node under which this node resides in the tree (or undefined if this is a root node of the tree).
	 */
	parent: (node: SharedTreeNode) => SharedTreeNode | undefined;
	/**
	 * Register an event listener on the given node.
	 * @returns A callback function which will deregister the event.
	 * This callback should be called only once.
	 */
	on: <K extends keyof EditableTreeEvents>(
		node: SharedTreeNode,
		eventName: K,
		listener: EditableTreeEvents[K],
	) => () => void;
	/**
	 * Returns the {@link TreeStatus} of the given node.
	 */
	status: (node: SharedTreeNode) => TreeStatus;
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
	parent: (node) => {
		const treeNode = assertTreeNode(node).parentField.parent.parent;
		if (treeNode !== undefined) {
			return getProxyForNode(treeNode as any); // TODO: why does this get weirdly narrowed without the `any`?
		}

		return undefined;
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
