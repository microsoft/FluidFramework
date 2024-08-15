/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { NodeKind, TreeNodeSchemaClass } from "./treeNodeSchema.js";

/**
 * The type of a {@link TreeNode}.
 * For more information about the type, use `Tree.schema(theNode)` instead.
 * @remarks
 * This symbol mainly exists on nodes to allow TypeScript to provide more accurate type checking.
 * `Tree.is` and `Tree.schema` provide a superset of this information in more friendly ways.
 *
 * This symbol should not manually be added to objects as doing so allows the object to be invalidly used where nodes are expected.
 * Instead construct a real node of the desired type using its constructor.
 * @privateRemarks
 * This prevents non-nodes from being accidentally used as nodes, as well as allows the type checker to distinguish different node types.
 * @deprecated External code should use `Tree.schema(theNode)` for runtime data access, and for typechecking and internally {@link typeSchemaSymbol} provides a superset of this functionality.
 * @system @public
 */
export const typeNameSymbol: unique symbol = Symbol("TreeNode Type");

/**
 * The type of a {@link TreeNode}.
 * For more information about the type, use `Tree.schema(theNode)` instead.
 * @remarks
 * This symbol mainly exists on nodes to allow TypeScript to provide more accurate type checking.
 * `Tree.is` and `Tree.schema` provide a superset of this information in more friendly ways.
 *
 * This symbol should not manually be added to objects as doing so allows the object to be invalidly used where nodes are expected.
 * Instead construct a real node of the desired type using its constructor.
 * @privateRemarks
 * This prevents non-nodes from being accidentally used as nodes, as well as allows the type checker to distinguish different node types.
 * @system @public
 */
export const typeSchemaSymbol: unique symbol = Symbol("TreeNode Schema");

/**
 * Adds a type symbol to a type for stronger typing.
 * @remarks
 * An implementation detail of {@link TreeNode}'s strong typing setup: not intended for direct use outside of this package.
 * @sealed @public
 */
export interface WithType<
	out Name extends string = string,
	out Kind extends NodeKind = NodeKind,
> {
	/**
	 * Type symbol, marking a type in a way to increase type safety via strong type checking.
	 * @deprecated Use {@link typeSchemaSymbol} instead.
	 */
	get [typeNameSymbol](): Name;

	/**
	 * Type symbol, marking a type in a way to increase type safety via strong type checking.
	 */
	get [typeSchemaSymbol](): TreeNodeSchemaClass<Name, Kind>;
}
