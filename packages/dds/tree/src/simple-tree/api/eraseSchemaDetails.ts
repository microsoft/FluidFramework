/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	TreeNode,
	TreeNodeSchema,
	NodeKind,
	TreeNodeSchemaClass,
	WithType,
} from "../core/index.js";

/**
 * Type-erase details of a schema.
 *
 * @typeParam TNode - The type to narrow the node to.
 * Typically {@link TreeNode} intersected with the public interface for the component.
 * @typeParam ExtraSchemaProperties - Properties of the schema (statics on the schema class) to retain in addition to the basic {@link TreeNodeSchema}.
 * Typically includes at least one static factory method for creating nodes.
 * @remarks
 * This can be used to type erase the details of a schema including the node's type (such as its fields and APIs for modifying those fields).
 * This is intended for use on component boundaries to support encapsulation of implementation details, including the exact schema.
 *
 * This is best applied to a top level "component node" which wraps the actual component content (in a single required object node field) allowing more cases of schema evolution to be carried out as implementation details of the component.
 *
 * Since this type-erases the schema details, the remaining API will need to provide ways to construct instances of the node and access its contents.
 * Typically construction is done via static functions on the schema which can be included in `ExtraSchemaProperties`,
 * and access to contents is done via properties of TNode (usually methods).
 *
 * @example
 * ```typescript
 * const schema = new SchemaFactory("com.example");
 *
 * interface SquareNode {
 * 	readonly area: number;
 * }
 *
 * interface SquareSchema {
 * 	create(sideLength: number): Square;
 * }
 *
 * class SquareInternal
 * 	extends schema.object("Demo", { hidden: schema.number })
 * 	implements SquareNode
 * {
 * 	public get area(): number {
 * 		return this.hidden * this.hidden;
 * 	}
 *
 * 	public static create(sideLength: number): SquareInternal {
 * 		return new SquareInternal({ hidden: sideLength });
 * 	}
 * }
 *
 * const Square = eraseSchemaDetails<Square, SquareSchema>()(SquareInternal);
 * type Square = SquareNode & TreeNode & WithType<"com.example.Demo">;
 * ```
 * @privateRemarks
 * See "example" test for an executable version of this example.
 * @alpha
 */
export function eraseSchemaDetails<TNode, ExtraSchemaProperties = unknown>(): <
	T extends ExtraSchemaProperties & TreeNodeSchema<string, NodeKind, TNode & TreeNode>,
>(
	schema: T,
) => ExtraSchemaProperties &
	TreeNodeSchema<
		T["identifier"],
		NodeKind,
		TNode & TreeNode & WithType<T["identifier"]>,
		never,
		false
	> {
	return (schema) => schema as never;
}

/**
 * Like {@link eraseSchemaDetails} but allows the returned schema to be subclassed.
 * @example
 * ```typescript
 * const schema = new SchemaFactory("com.example");
 *
 * interface SquareInterface {
 * 	readonly area: number;
 * }
 *
 * class SquareInternal
 * 	extends schema.object("Demo", { size: schema.number })
 * 	implements SquareInterface
 * {
 * 	public get area(): number {
 * 		return this.size * this.size;
 * 	}
 * }
 *
 * class Square extends eraseSchemaDetailsSubclassable<SquareInterface>()(SquareInternal) {
 * 	public static create(sideLength: number): Square {
 * 		return new (this as TreeNodeSchema as typeof SquareInternal)({ size: sideLength });
 * 	}
 * }
 *
 * const square = Square.create(10);
 * assert.equal(square.area, 100);
 * ```
 * @privateRemarks
 * See "example" test for an executable version of this example.
 * @alpha
 */
export function eraseSchemaDetailsSubclassable<TNode, ExtraSchemaProperties = unknown>(): <
	T extends ExtraSchemaProperties & TreeNodeSchemaClass<string, NodeKind, TNode & TreeNode>,
>(
	schema: T,
) => ExtraSchemaProperties &
	TreeNodeSchemaClass<
		T["identifier"],
		NodeKind,
		TNode & TreeNode & WithType<T["identifier"]>,
		never,
		false
	> {
	return (schema) => schema as never;
}
