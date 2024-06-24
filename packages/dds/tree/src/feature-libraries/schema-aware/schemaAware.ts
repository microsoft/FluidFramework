/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
	TreeNodeSchemaIdentifier,
	TreeValue,
	ValueSchema,
	Multiplicity,
} from "../../core/index.js";
import type { Assume, FlattenKeys, _InlineTrick } from "../../util/index.js";
import type {
	ContextuallyTypedNodeData,
	typeNameSymbol,
	valueSymbol,
} from "../contextuallyTyped.js";
import type {
	FlexAllowedTypes,
	FlexFieldNodeSchema,
	FlexFieldSchema,
	FlexListToUnion,
	FlexMapNodeSchema,
	FlexObjectNodeFields,
	FlexObjectNodeSchema,
	FlexTreeNodeSchema,
	LazyItem,
	LeafNodeSchema,
} from "../typed-schema/index.js";

/**
 * Empty Object for use in type computations that should contribute no fields when `&`ed with another type.
 * @internal
 */
// Using {} instead of interface {} or Record<string, never> for empty object here produces better IntelliSense in the generated types than `Record<string, never>` recommended by the linter.
// Making this a type instead of an interface prevents it from showing up in IntelliSense, and also avoids breaking the typing somehow.
// eslint-disable-next-line @typescript-eslint/ban-types, @typescript-eslint/consistent-type-definitions
export type EmptyObject = {};

/**
 * Collects the various parts of the API together.
 * @internal
 */
export type CollectOptions<
	TTypedFields,
	TValueSchema extends ValueSchema | undefined,
	TName,
> = TValueSchema extends undefined
	? FlattenKeys<
			{ [typeNameSymbol]?: UnbrandedName<TName> } & (TValueSchema extends ValueSchema
				? { [valueSymbol]: TreeValue<TValueSchema> }
				: EmptyObject)
		> &
			TTypedFields
	: TValueSchema extends ValueSchema
		? TreeValue<TValueSchema>
		: undefined;

/**
 * Remove type brand from name.
 * @internal
 */
export type UnbrandedName<TName> = [
	TName extends TreeNodeSchemaIdentifier<infer S> ? S : string,
][_InlineTrick];

/**
 * `{ [key: string]: FieldSchemaTypeInfo }` to `{ [key: string]: TypedTree }`
 *
 * In Editable mode, unwraps the fields.
 * @internal
 */
export type TypedFields<
	TFields extends undefined | { readonly [key: string]: FlexFieldSchema },
> = [
	TFields extends { [key: string]: FlexFieldSchema }
		? {
				-readonly [key in keyof TFields]: InsertableFlexField<TFields[key]>;
			}
		: EmptyObject,
][_InlineTrick];

/**
 * `TreeFieldSchema` to `TypedField`. May unwrap to child depending on FieldKind.
 * @internal
 */
export type InsertableFlexField<TField extends FlexFieldSchema> = [
	ApplyMultiplicity<
		TField["kind"]["multiplicity"],
		AllowedTypesToFlexInsertableTree<TField["allowedTypes"]>
	>,
][_InlineTrick];

/**
 * Adjusts the API for a field based on its Multiplicity.
 * @internal
 */
export type ApplyMultiplicity<TMultiplicity extends Multiplicity, TypedChild> = {
	[Multiplicity.Forbidden]: undefined;
	[Multiplicity.Optional]: undefined | TypedChild;
	[Multiplicity.Sequence]: TypedChild[];
	[Multiplicity.Single]: TypedChild;
}[TMultiplicity];

/**
 * Takes in `AllowedTypes` and returns a TypedTree union.
 * @internal
 */
export type AllowedTypesToFlexInsertableTree<T extends FlexAllowedTypes> = [
	T extends readonly LazyItem<FlexTreeNodeSchema>[]
		? InsertableFlexNode<Assume<FlexListToUnion<T>, FlexTreeNodeSchema>>
		: ContextuallyTypedNodeData,
][_InlineTrick];

/**
 * Generate a schema aware API for a single tree schema.
 * @internal
 */
export type InsertableFlexNode<TSchema extends FlexTreeNodeSchema> = FlattenKeys<
	CollectOptions<
		TSchema extends FlexObjectNodeSchema<string, infer TFields extends FlexObjectNodeFields>
			? TypedFields<TFields>
			: TSchema extends FlexFieldNodeSchema<string, infer TField extends FlexFieldSchema>
				? InsertableFlexField<TField>
				: TSchema extends FlexMapNodeSchema<string, infer TField extends FlexFieldSchema>
					? {
							readonly [P in string]: InsertableFlexField<TField>;
						}
					: EmptyObject,
		TSchema extends LeafNodeSchema<string, infer TValueSchema extends ValueSchema>
			? TValueSchema
			: undefined,
		TSchema["name"]
	>
>;
