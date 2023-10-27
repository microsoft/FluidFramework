/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fail } from "../../../util";
import { NormalizeAllowedTypes, structuralName } from "../../schemaBuilderBase";
import { Any, TreeNodeSchema, schemaIsFieldNode } from "../../typed-schema";
import { EditableTreeEvents } from "../../untypedTree";
import { TreeNode, TreeStatus } from "../editableTreeTypes";
import { getProxyForNode } from "./proxies";
import { ProxyNode, SharedTreeList, SharedTreeNode, getTreeNode } from "./types";

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
	 * Narrow the type of the given value if it is a list containing the given schema.
	 * @example
	 * ```ts
	 * if (node.isList(myNode, point)) {
	 *     const y = myNode[0].y; // `myNode` is now known to be a list of `point`s.
	 * }
	 * ```
	 */
	readonly isListOf: <TSchema extends TreeNodeSchema | Any | readonly TreeNodeSchema[]>(
		value: unknown,
		itemSchema: TSchema,
	) => value is SharedTreeList<NormalizeAllowedTypes<TSchema>>;
	/**
	 * Return the node under which this node resides in the tree (or undefined if this is a root node of the tree).
	 */
	readonly parent: (node: SharedTreeNode) => SharedTreeNode | undefined;
	/**
	 * The key of the given node under its parent.
	 * @remarks
	 * If `node` is an element in a {@link SharedTreeList}, this returns the index of `node` in the list (a `number`).
	 * Otherwise, this returns the key of the field that it is under (a `string`).
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
export const nodeApi: NodeApi = {
	schema: (node: SharedTreeNode) => {
		return assertTreeNode(node).schema;
	},
	is: <TSchema extends TreeNodeSchema>(
		value: unknown,
		schema: TSchema,
	): value is ProxyNode<TSchema> => {
		return getTreeNode(value)?.is(schema) ?? false;
	},
	isListOf: <TSchema extends TreeNodeSchema | Any | readonly TreeNodeSchema[]>(
		value: unknown,
		itemTypes: TSchema,
	): value is SharedTreeList<NormalizeAllowedTypes<TSchema>> => {
		const schemaName = getTreeNode(value)?.schema.name;
		// TODO: not gonna work. We don't know which part of the name is the scope and which part is not.
		// const unscopedName =
		// 	schemaName?.substring(schemaName.indexOf(".")) ?? fail("Malformed schema name.");

		return structuralName("List", itemTypes) === unscopedName;
	},
	parent: (node: SharedTreeNode) => {
		const treeNode = assertTreeNode(node).parentField.parent.parent;
		if (treeNode !== undefined) {
			return getProxyForNode(treeNode);
		}

		return undefined;
	},
	key: (node: SharedTreeNode) => {
		const treeNode = assertTreeNode(node);
		const parent = nodeApi.parent(node);
		if (parent !== undefined) {
			const parentSchema = nodeApi.schema(parent);
			if (schemaIsFieldNode(parentSchema)) {
				// The parent of `node` is a list
				return treeNode.parentField.index;
			}
		}

		// The parent of `node` is an object, a map, or undefined (and therefore `node` is a root/detached node).
		return treeNode.parentField.parent.key;
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
