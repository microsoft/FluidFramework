/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type { UnionToIntersection } from "../util/index.js";
import type {
	TreeNodeSchema,
	TreeNode,
	AllowedTypes,
	FlexListToUnion,
	ImplicitAllowedTypes,
	InsertableTreeNodeFromAllowedTypes,
	LazyItem,
	NodeFromSchema,
	TreeLeafValue,
	InsertableTypedNode,
	TreeNodeFromImplicitAllowedTypes,
} from "./core/index.js";
import type { InsertableContent } from "./unhydratedFlexTreeFromInsertable.js";

/**
 * {@link UnionToIntersection} except it does not distribute over {@link CustomizedSchemaTyping}s when the original type is a union.
 * @privateRemarks
 * This is a workaround for TypeScript distributing over intersections over unions when distributing extends over unions.
 * @system @public
 */
export type SchemaUnionToIntersection<T> = [T] extends [
	CustomizedSchemaTyping<unknown, CustomTypes>,
]
	? T
	: UnionToIntersection<T>;

/**
 * {@inheritdoc (CustomizedTyping:type)}
 * @system @public
 */
export const CustomizedTyping: unique symbol = Symbol("CustomizedTyping");

/**
 * A type brand used by {@link customizeSchemaTyping}.
 * @system @public
 */
export type CustomizedTyping = typeof CustomizedTyping;

/**
 * Collection of schema aware types.
 * @remarks
 * This type is only used as a type constraint.
 * It's fields are similar to an unordered set of generic type parameters.
 * {@link customizeSchemaTyping} applies this to {@link ImplicitAllowedTypes} via {@link CustomizedSchemaTyping}.
 * @sealed @public
 */
export interface CustomTypes {
	/**
	 * Type used for inserting values.
	 */
	readonly input: unknown;
	/**
	 * Type used for the read+write property on object nodes.
	 *
	 * Set to never to disable setter.
	 * @remarks
	 * Due to https://github.com/microsoft/TypeScript/issues/43826 we cannot set the desired setter type.
	 * Instead we can only control the types of the read+write property and the type of a readonly property.
	 *
	 * For recursive types using {@link SchemaFactory.objectRecursive}, support for using `never` to remove setters is limited:
	 * When the customized schema is wrapped in an {@link FieldSchema}, the setter will not be fully removed.
	 */
	readonly readWrite: TreeLeafValue | TreeNode;
	/**
	 * Type for reading data.
	 * @remarks
	 * See limitation for read+write properties on ObjectNodes in {@link CustomTypes.readWrite}.
	 */
	readonly output: TreeLeafValue | TreeNode;
}

/**
 * Type annotation which overrides the default schema derived types with customized ones.
 * @remarks
 * See {@link customizeSchemaTyping} for more information.
 * @system @public
 */
export type CustomizedSchemaTyping<TSchema, TCustom extends CustomTypes> = TSchema & {
	[CustomizedTyping]: TCustom;
};

/**
 * Default strict policy.
 *
 * @typeparam TSchema - The schema to process
 * @typeparam TInput - Internal: do not specify.
 * @typeparam TOutput - Internal: do not specify.
 * @remarks
 * Handles input types contravariantly so any input which might be invalid is rejected.
 * @sealed @public
 */
export interface StrictTypes<
	TSchema extends ImplicitAllowedTypes,
	TInput = DefaultInsertableTreeNodeFromImplicitAllowedTypes<TSchema>,
	TOutput extends TreeNode | TreeLeafValue = DefaultTreeNodeFromImplicitAllowedTypes<TSchema>,
> {
	input: TInput;
	readWrite: TInput extends never ? never : TOutput;
	output: TOutput;
}

/**
 * Customizes the types associated with `TSchema`
 * @remarks
 * By default, the types used when constructing, reading and writing tree nodes are derived from the schema.
 * In some cases, it may be desirable to override these types with carefully selected alternatives.
 * This utility allows for that customization.
 * Note that this customization is only used for typing, and does not affect the runtime behavior at all.
 *
 * This can be used for a wide variety of purposes, including (but not limited to):
 *
 * 1. Implementing better typing for a runtime extensible set of types (e.g. a polymorphic collection).
 * This is commonly needed when implementing containers which don't directly reference their child types, and can be done using {@link Customizer.simplified}.
 * 2. Adding type brands to specific values to increase type safety.
 * This can be done using {@link Customizer.simplified}.
 * 3. Adding some (compile time only) constraints to values, like enum style unions.
 * This can be done using {@link Customizer.simplified}.
 * 4. Making fields readonly (for the current client).
 * This can be done using {@link Customizer.custom} with `{ readWrite: never; }`.
 * 5. Opting into more [compleat and less sound](https://en.wikipedia.org/wiki/Soundness#Relation_to_completeness) typing.
 * {@link Customizer.relaxed} is an example of this.
 *
 * For this customization to be used, the resulting schema must be used as `ImplicitAllowedTypes`.
 * For example applying this to a single type, then using that type in an array of allowed types will have no effect:
 * in such a case the customization must instead be applied to the array of allowed types.
 * @privateRemarks
 * Once this API is more stable/final, the examples in tests such as openPolymorphism.spec.ts and schemaFactory.examples.spec.ts
 * should be copied into examples here, or somehow linked.
 * @alpha
 */
export function customizeSchemaTyping<const TSchema extends ImplicitAllowedTypes>(
	schema: TSchema,
): Customizer<TSchema> {
	// This function just does type branding, and duplicating the typing here to avoid any would just make it harder to maintain not easier:
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const f = (): any => schema;
	return { strict: f, relaxed: f, simplified: f, simplifiedUnrestricted: f, custom: f };
}

/**
 * Utility for customizing the types used for data matching a given schema.
 * @sealed @alpha
 */
export interface Customizer<TSchema extends ImplicitAllowedTypes> {
	/**
	 * The default {@link StrictTypes}, explicitly applied.
	 */
	strict(): CustomizedSchemaTyping<TSchema, StrictTypes<TSchema>>;
	/**
	 * Relaxed policy: allows possible invalid edits (which will err at runtime) when schema is not exact.
	 * @remarks
	 * Handles input types covariantly so any input which might be valid with the schema is allowed
	 * instead of the default strict policy of only inputs with all possible schema are allowed.
	 *
	 * This only modifies the typing shallowly: the typing of children are not effected.
	 */
	relaxed(): CustomizedSchemaTyping<
		TSchema,
		{
			input: TreeNodeSchema extends TSchema
				? InsertableContent
				: // This intentionally distributes unions over the conditional to get covariant type handling.
					TSchema extends TreeNodeSchema
					? InsertableTypedNode<TSchema>
					: // This intentionally distributes unions over the conditional to get covariant type handling.
						TSchema extends AllowedTypes
						? TSchema[number] extends LazyItem<infer TSchemaInner extends TreeNodeSchema>
							? InsertableTypedNode<TSchemaInner, TSchemaInner>
							: never
						: never;
			readWrite: TreeNodeFromImplicitAllowedTypes<TSchema>;
			output: TreeNodeFromImplicitAllowedTypes<TSchema>;
		}
	>;
	/**
	 * Replace typing with a single substitute which allowed types must implement.
	 * @remarks
	 * This is generally type safe for reading the tree, but allows instances of `T` other than those listed in the schema to be assigned,
	 * which can be out of schema and err at runtime in the same way {@link Customizer.relaxed} does.
	 * Until with {@link Customizer.relaxed}, implicit construction is disabled, meaning all nodes must be explicitly constructed (and thus implement `T`) before being inserted.
	 */
	simplified<T extends TreeNodeFromImplicitAllowedTypes<TSchema>>(): CustomizedSchemaTyping<
		TSchema,
		{
			input: T;
			readWrite: T;
			output: T;
		}
	>;

	/**
	 * The same as {@link Customizer} except that more T values are allowed, even ones not known to be implemented by `TSchema`.
	 */
	simplifiedUnrestricted<T extends TreeNode | TreeLeafValue>(): CustomizedSchemaTyping<
		TSchema,
		{
			input: T;
			readWrite: T;
			output: T;
		}
	>;

	/**
	 * Fully arbitrary customization.
	 * Provided types override existing types.
	 */
	custom<T extends Partial<CustomTypes>>(): CustomizedSchemaTyping<
		TSchema,
		{
			// Check if property is provided. This check is needed to early out missing values so if undefined is allowed,
			// not providing the field doesn't overwrite the corresponding type with undefined.
			// TODO: test this case
			[Property in keyof CustomTypes]: Property extends keyof T
				? T[Property] extends CustomTypes[Property]
					? T[Property]
					: GetTypes<TSchema>[Property]
				: GetTypes<TSchema>[Property];
		}
	>;
}

/**
 * Fetch types associated with a schema, or use the default if not customized.
 * @system @public
 */
export type GetTypes<TSchema extends ImplicitAllowedTypes> = [TSchema] extends [
	CustomizedSchemaTyping<unknown, infer TCustom>,
]
	? TCustom
	: StrictTypes<TSchema>;

/**
 * Content which could be inserted into a tree.
 *
 * @see {@link Input}
 * @remarks
 * Alias of {@link InsertableTreeNodeFromImplicitAllowedTypes} with a shorter name.
 * @alpha
 */
export type Insertable<TSchema extends ImplicitAllowedTypes> =
	InsertableTreeNodeFromImplicitAllowedTypes<TSchema>;

/**
 * Default type of tree node for a field of the given schema.
 * @system @public
 */
export type DefaultTreeNodeFromImplicitAllowedTypes<
	TSchema extends ImplicitAllowedTypes = TreeNodeSchema,
> = TSchema extends TreeNodeSchema
	? NodeFromSchema<TSchema>
	: TSchema extends AllowedTypes
		? NodeFromSchema<FlexListToUnion<TSchema>>
		: unknown;

/**
 * Type of content that can be inserted into the tree for a node of the given schema.
 *
 * @typeparam TSchema - Schema to process.
 * @remarks
 * Defaults to {@link DefaultInsertableTreeNodeFromImplicitAllowedTypes}.
 * @public
 */
export type InsertableTreeNodeFromImplicitAllowedTypes<TSchema extends ImplicitAllowedTypes> =
	GetTypes<TSchema>["input"];

/**
 * Type of content that can be inserted into the tree for a node of the given schema.
 *
 * @see {@link Input}
 *
 * @typeparam TSchema - Schema to process.
 *
 * @privateRemarks
 * This is a bit overly conservative, since cases like `A | [A]` give never and could give `A`.
 * @system @public
 */
export type DefaultInsertableTreeNodeFromImplicitAllowedTypes<
	TSchema extends ImplicitAllowedTypes,
> = [TSchema] extends [TreeNodeSchema]
	? InsertableTypedNode<TSchema>
	: [TSchema] extends [AllowedTypes]
		? InsertableTreeNodeFromAllowedTypes<TSchema>
		: never;
