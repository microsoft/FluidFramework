/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// Used by doc links:
// eslint-disable-next-line @typescript-eslint/no-unused-vars, unused-imports/no-unused-imports
import type { TreeAlpha } from "../../shared-tree/index.js";

import type { TreeNode } from "./treeNode.js";
import type { NodeKind, TreeNodeSchemaClass } from "./treeNodeSchema.js";

/**
 * An internal brand to improve compiler performance.
 * For more information about the type, use `Tree.schema(theNode)` instead.
 * @remarks
 * `Tree.is` and `Tree.schema` provide a superset of this information in more friendly ways.
 * @privateRemarks
 * The identifier of a {@link TreeNode}'s schema.
 * This allows the type checker to distinguish different node types more efficiently than via {@link typeSchemaSymbol}.
 * @deprecated External code should use `Tree.schema(theNode)` for schema related runtime data access. For type narrowing, use {@link WithType} instead of the symbols directly.
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
 * The intended type of insertable content that is to become a {@link TreeNode}.
 * @remarks Use the type-safe {@link (TreeAlpha:interface).tagContentSchema} function to tag insertable content with this symbol.
 *
 * If a property with this symbol key is present on an object that is inserted into the tree,
 * the tree will use the schema identifier specified by the value of this property when creating the node.
 * This is particularly useful for specifying the intended schema of untyped content when it would otherwise be ambiguous.
 * @example
 * ```typescript
 * const sf = new SchemaFactory("example");
 * class Dog extends sf.object("Dog", { name: sf.string() }) {}
 * class Cat extends sf.object("Cat", { name: sf.string() }) {}
 * class Root extends sf.object("Root", { pet: [Dog, Cat] }) {}
 * // ...
 * view.root.pet = { name: "Max" }; // Error: ambiguous schema - is it a Dog or a Cat?
 * view.root.pet = { name: "Max", [contentSchemaSymbol]: "example.Dog" }; // No error - it's a Dog.
 * ```
 * @alpha
 */
export const contentSchemaSymbol: unique symbol = Symbol("SharedTree Schema");

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
 * @privateRemarks
 * The properties of this are implemented as getters rather than instance properties as that is the easiest way to make them non-enumerable,
 * and also saves memory and time as they only have to be setup on the prototype.
 * These being non-enumerable inherited properties minimizes impact on users,
 * hiding them from things like `Reflect.ownKeys`, Object spread, `Object.getOwnPropertyDescriptors`, and `for...in` loops.
 * How we declare them here actually doesn't impact that,
 * but is a good way to communicate to users and internal devs that these should be implemented as inherited getters to accomplish the above.
 * @sealed @public
 */
export interface WithType<
	out TName extends string = string,
	out TKind extends NodeKind = NodeKind,
	out TInfo = unknown,
> {
	/**
	 * Type symbol, marking a type in a way to increase type safety via strong type checking.
	 *
	 * Use `Tree.schema(theNode)` for schema related runtime data access. For type narrowing, use `WithType` instead of the symbols directly.
	 * @remarks
	 * This should be redundant with {@link typeSchemaSymbol}, but is kept for improved compiler performance.
	 * If we just rely on {@link typeSchemaSymbol}, the compiler has to work much harder to distinguish schema in unions,
	 * which can cause large schema unions to hit "error TS2859: Excessive complexity comparing types".
	 *
	 * This property is not intended for any use other than helping the compiler distinguish schema types,
	 * and should not be referenced in any code other than internal to the tree package.
	 * @deprecated Use {@link typeSchemaSymbol} instead.
	 */
	get [typeNameSymbol](): TName;

	/**
	 * Type symbol, marking a type in a way to increase type safety via strong type checking.
	 */
	get [typeSchemaSymbol](): TreeNodeSchemaClass<TName, TKind, TreeNode, never, boolean, TInfo>;
}
