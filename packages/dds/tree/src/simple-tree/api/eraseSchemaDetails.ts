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
 * @typeParam TNode - Public instance members to retain.
 * @typeParam ExtraSchemaProperties - Public static members to retain.
 * @typeParam TReserved - Additional instance-member typing to preserve in the returned type.
 * Use {@link MaskedProperties} for read-only access with unknown values, or a named class with TypeScript-private members to prevent conflicting subclass declarations.
 * Defaults to `unknown`, which adds no members.
 * @returns A function that returns its schema argument with the implementation details erased.
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
 * class Square extends eraseSchemaDetailsSubclassable<
 * 	SquareInterface,
 * 	unknown,
 * 	MaskedProperties<"size">
 * >()(SquareInternal) {
 * 	public static create(sideLength: number): Square {
 * 		return TreeBeta.importConcise(this, { size: sideLength });
 * 	}
 * }
 *
 * const square = Square.create(10);
 * assert.equal(square.area, 100);
 * ```
 * @remarks
 * Erasing a member's type does not remove that member at runtime.
 * Subclasses can accidentally overwrite an erased field or method, or collide with a getter that has no setter.
 * This is especially important for schema factories whose returned classes are subclassed by other code.
 *
 * Prefer JavaScript-private (`#`) members or non-exported symbols for implementation details where possible.
 * These avoid collisions without adding public property names.
 * TypeScript-private members do not provide runtime privacy, and erasing their declaring type also erases their protection.
 *
 * For string-named implementation members, supply `TReserved` separately from `TNode`.
 * These additional type-only members do not need to be implemented by the input schema, and do not change runtime behavior.
 * Keep their names separate from public instance-member names.
 * When declaring an explicit return type, preserve the same `TReserved` with {@link ErasedSchemaSubclassable}.
 * An annotation that omits it discards its checks.
 *
 * {@link MaskedProperties} exposes optional, read-only properties with `unknown` values.
 * It rejects direct writes through the masked type, without assuming that a property exists or holds an object.
 * It does not prevent subclass overrides.
 * TypeScript's `noImplicitOverride` option does not require an `override` modifier for these mapped properties.
 * To prevent conflicting subclass declarations, use a named class with TypeScript-private members:
 *
 * ```typescript
 * declare class SquareReservations {
 * 	private size: unknown;
 * }
 *
 * const SquareBase: ErasedSchemaSubclassable<
 * 	SquareInterface,
 * 	"com.example.Demo",
 * 	SquareReservations
 * > = eraseSchemaDetailsSubclassable<SquareInterface, unknown, SquareReservations>()(SquareInternal);
 * ```
 *
 * Declare such reservation classes outside exported factory functions so their names can be used in emitted declarations.
 * Neither approach prevents JavaScript callers or type assertions from bypassing the restrictions.
 * Static implementation members are not reserved by `TReserved`; prefer JavaScript-private members or non-exported symbols for them.
 * @privateRemarks
 * See "example" test for an executable version of this example.
 * @alpha
 */
export function eraseSchemaDetailsSubclassable<
	TNode,
	ExtraSchemaProperties = unknown,
	TReserved = unknown,
>(): <
	T extends ExtraSchemaProperties & TreeNodeSchemaClass<string, NodeKind, TNode & TreeNode>,
>(
	schema: T,
) => ExtraSchemaProperties &
	TreeNodeSchemaClass<
		T["identifier"],
		NodeKind,
		TNode & TReserved & TreeNode & WithType<T["identifier"]>,
		never,
		false
	> {
	return (schema) => schema as never;
}

/**
 * Masks instance properties as optional, read-only properties with unknown values.
 * @typeParam TKeys - Property names to mask, including names intended for future implementation members.
 * @remarks
 * Use this as the `TReserved` argument of {@link eraseSchemaDetailsSubclassable} and {@link ErasedSchemaSubclassable}.
 * Reads produce `unknown` values, without assuming that a property exists or holds an object.
 * Direct writes through the masked type are rejected, but subclass overrides are allowed.
 * TypeScript's `noImplicitOverride` option does not require an `override` modifier for these mapped properties.
 * To prevent conflicting subclass declarations, pass a named class with TypeScript-private members instead.
 *
 * This type does not add or change runtime properties.
 * Masked properties remain visible in the type.
 * Do not depend on their runtime representation.
 * @alpha
 */
export type MaskedProperties<TKeys extends PropertyKey> = {
	readonly [TKey in TKeys]?: unknown;
};

/**
 * The type of an erased schema.
 * @remarks
 * Provides an {@link https://www.typescriptlang.org/tsconfig/#isolatedDeclarations | isolatedDeclarations}
 * compatible way to explicitly type the return value from {@link eraseSchemaDetails}.
 * @example
 * ```typescript
 * export const Square: SquareSchema & ErasedSchema<Square> = eraseSchemaDetails<Square, SquareSchema>()(SquareInternal);
 * export type Square = ErasedNode<SquareNode, "com.example.Demo">;
 * ```
 * @alpha
 */
export type ErasedSchema<NodeType extends TreeNode> = TreeNodeSchema<
	NodeType extends WithType<infer Identifier> ? Identifier : string,
	NodeKind,
	NodeType,
	never,
	false
>;

/**
 * The type of an erased schema's node.
 * @remarks
 * Provides a way to concisely and explicitly type the node type for a schema returned from {@link eraseSchemaDetails}.
 * @example
 * ```typescript
 * export const Square: SquareSchema & ErasedSchema<Square> = eraseSchemaDetails<Square, SquareSchema>()(SquareInternal);
 * export type Square = ErasedNode<SquareNode, "com.example.Demo">;
 * ```
 * @alpha
 */
export type ErasedNode<TExtra, Identifier extends string> = TExtra &
	TreeNode &
	WithType<Identifier>;

/**
 * The type of a subclassable erased schema.
 * @typeParam TExtra - Public instance members to retain.
 * @typeParam Identifier - Identifier of the schema.
 * @typeParam TReserved - Additional instance-member typing, matching the `TReserved` argument to {@link eraseSchemaDetailsSubclassable}.
 * Defaults to `unknown`, which adds no members.
 * @remarks
 * Provides an {@link https://www.typescriptlang.org/tsconfig/#isolatedDeclarations | isolatedDeclarations}
 * compatible way to explicitly type the return value from {@link eraseSchemaDetailsSubclassable}.
 * Include `TReserved` to preserve its checks when annotating exported schema factories.
 * Use {@link MaskedProperties} for read-only access with unknown values, or a named class with TypeScript-private members to prevent conflicting subclass declarations.
 * @example
 * ```typescript
 * export const SquareSubclassable: SquareSchema &
 * 	ErasedSchemaSubclassable<SquareNode, "com.example.Demo"> = eraseSchemaDetailsSubclassable<
 * 	Square,
 * 	SquareSchema
 * >()(SquareInternal);
 *
 * class SquareSubclass extends SquareSubclassable {}
 * ```
 * @alpha
 */
export type ErasedSchemaSubclassable<
	TExtra,
	Identifier extends string,
	TReserved = unknown,
> = TreeNodeSchemaClass<
	Identifier,
	NodeKind,
	ErasedNode<TExtra & TReserved, Identifier>,
	never,
	false
>;
