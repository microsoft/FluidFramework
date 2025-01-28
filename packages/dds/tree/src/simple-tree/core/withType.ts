/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { NodeKind, TreeNodeSchemaClass } from "./treeNodeSchema.js";
import type { TreeNode } from "./types.js";

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
 * @deprecated External code should use `Tree.schema(theNode)` for schema related runtime data access. For type narrowing, use `WithType` instead of the symbols directly.
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
 * This symbol should not manually be added to objects as doing so allows the object to be invalidly used where specific nodes are expected.
 * Instead construct a real node of the desired type using its constructor.
 *
 * This symbol should not be used directly for type narrowing. Instead use {@link WithType}.
 * @privateRemarks
 * This prevents non-nodes from being accidentally used as nodes and allows the type-checker to distinguish different node types.
 * @system @public
 */
export const typeSchemaSymbol: unique symbol = Symbol("TreeNode Schema");

/**
 * Adds a type symbol to a type for stronger typing.
 *
 * @typeParam TName - Same as {@link TreeNodeSchema}'s "Name" parameter.
 * @typeParam TKind - Same as {@link TreeNodeSchema}'s "Kind" parameter.
 * @typeParam TInfo - Same as {@link TreeNodeSchema}'s "Info" parameter: format depends on the Kind.
 * @remarks
 * Powers {@link TreeNode}'s strong typing setup.
 * @example Narrow types for overloading based on NodeKind
 * ```typescript
 * function getKeys(node: TreeNode & WithType<string, NodeKind.Array>): number[];
 * function getKeys(node: TreeNode & WithType<string, NodeKind.Map | NodeKind.Object>): string[];
 * function getKeys(node: TreeNode): string[] | number[];
 * function getKeys(node: TreeNode): string[] | number[] {
 * 	const schema = Tree.schema(node);
 * 	switch (schema.kind) {
 * 		case NodeKind.Array: {
 * 			const arrayNode = node as TreeArrayNode;
 * 			const keys: number[] = [];
 * 			for (let index = 0; index < arrayNode.length; index++) {
 * 				keys.push(index);
 * 			}
 * 			return keys;
 * 		}
 * 		case NodeKind.Map:
 * 			return [...(node as TreeMapNode).keys()];
 * 		case NodeKind.Object:
 * 			return Object.keys(node);
 * 		default:
 * 			throw new Error("Unsupported Kind");
 * 	}
 * }
 * ```
 * @sealed @public
 */
export interface WithType<
	out TName extends string = string,
	out TKind extends NodeKind = NodeKind,
	out TInfo = unknown,
> {
	/**
	 * Type symbol, marking a type in a way to increase type safety via strong type checking.
	 * @deprecated Use {@link typeSchemaSymbol} instead.
	 */
	get [typeNameSymbol](): TName;

	/**
	 * Type symbol, marking a type in a way to increase type safety via strong type checking.
	 */
	get [typeSchemaSymbol](): TreeNodeSchemaClass<TName, TKind, TreeNode, never, boolean, TInfo>;
}
