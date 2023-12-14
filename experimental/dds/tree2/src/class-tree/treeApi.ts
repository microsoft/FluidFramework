/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeStatus } from "../feature-libraries";
import { TreeNode, Tree as TreeSimple } from "../simple-tree";
// eslint-disable-next-line import/no-internal-modules
import { getClassSchema } from "../simple-tree/proxies";
import { NodeBase, NodeFromSchema, NodeKind, TreeNodeSchema } from "./schemaTypes";
import { getFlexSchema } from "./toFlexSchema";

/**
 * Provides various functions for analyzing {@link NodeBase}s.
 *
 * @privateRemarks
 * Inlining the typing of this interface onto the `Tree` object provides slightly different .d.ts generation,
 * which avoids typescript expanding the type of TreeNodeSchema and thus encountering
 * https://github.com/microsoft/rushstack/issues/1958.
 * @beta
 */
export interface TreeApi {
	/**
	 * The schema information for this node.
	 */
	schema<T extends NodeBase>(node: NodeBase): TreeNodeSchema<string, NodeKind, unknown, T>;
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
	parent(node: NodeBase): NodeBase | undefined;
	/**
	 * The key of the given node under its parent.
	 * @remarks
	 * If `node` is an element in a {@link (TreeArrayNode:interface)}, this returns the index of `node` in the list (a `number`).
	 * Otherwise, this returns the key of the field that it is under (a `string`).
	 */
	key(node: NodeBase): string | number;
	/**
	 * Register an event listener on the given node.
	 * @returns A callback function which will deregister the event.
	 * This callback should be called only once.
	 */
	on<K extends keyof TreeNodeEvents>(
		node: NodeBase,
		eventName: K,
		listener: TreeNodeEvents[K],
	): () => void;
	/**
	 * Returns the {@link TreeStatus} of the given node.
	 */
	readonly status: (node: NodeBase) => TreeStatus;
}

/**
 * The `Tree` object holds various functions for analyzing {@link NodeBase}s.
 * @beta
 */
export const nodeApi: TreeApi = {
	...(TreeSimple as unknown as TreeApi),
	is: <TSchema extends TreeNodeSchema>(
		value: unknown,
		schema: TSchema,
	): value is NodeFromSchema<TSchema> => {
		return TreeSimple.is(value, getFlexSchema(schema));
	},
	schema<T extends NodeBase>(node: NodeBase): TreeNodeSchema<string, NodeKind, unknown, T> {
		return getClassSchema(TreeSimple.schema(node as TreeNode)) as TreeNodeSchema<
			string,
			NodeKind,
			unknown,
			T
		>;
	},
};

/**
 * A collection of events that can be raised by a {@link NodeBase}.
 * @beta
 */
export interface TreeNodeEvents {
	/**
	 * Raised on a node right after a change is applied to one of its fields or the fields of a descendant node.
	 */
	afterChange(): void;
}
