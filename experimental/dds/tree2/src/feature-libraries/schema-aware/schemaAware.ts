/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeNodeSchemaIdentifier, TreeValue, ValueSchema } from "../../core";
import { ContextuallyTypedNodeData, typeNameSymbol, valueSymbol } from "../contextuallyTyped";
import {
	TreeFieldSchema,
	TreeNodeSchema,
	AllowedTypes,
	LeafNodeSchema,
	ObjectNodeSchema,
	Fields,
	FieldNodeSchema,
	MapNodeSchema,
	FlexListToUnion,
	LazyItem,
} from "../typed-schema";
import { Assume, FlattenKeys, _InlineTrick } from "../../util";
import { Multiplicity } from "../multiplicity";

/**
 * Empty Object for use in type computations that should contribute no fields when `&`ed with another type.
 * @alpha
 */
// Using {} instead of interface {} or Record<string, never> for empty object here produces better IntelliSense in the generated types than `Record<string, never>` recommended by the linter.
// Making this a type instead of an interface prevents it from showing up in IntelliSense, and also avoids breaking the typing somehow.
// eslint-disable-next-line @typescript-eslint/ban-types, @typescript-eslint/consistent-type-definitions
export type EmptyObject = {};

/**
 * Collects the various parts of the API together.
 * @alpha
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
 * @alpha
 */
export type UnbrandedName<TName> = [
	TName extends TreeNodeSchemaIdentifier<infer S> ? S : string,
][_InlineTrick];

/**
 * `{ [key: string]: FieldSchemaTypeInfo }` to `{ [key: string]: TypedTree }`
 *
 * In Editable mode, unwraps the fields.
 * @alpha
 */
export type TypedFields<TFields extends undefined | { readonly [key: string]: TreeFieldSchema }> = [
	TFields extends { [key: string]: TreeFieldSchema }
		? {
				-readonly [key in keyof TFields]: InsertableFlexField<TFields[key]>;
		  }
		: EmptyObject,
][_InlineTrick];

/**
 * `TreeFieldSchema` to `TypedField`. May unwrap to child depending on FieldKind.
 * @alpha
 */
export type InsertableFlexField<TField extends TreeFieldSchema> = [
	ApplyMultiplicity<
		TField["kind"]["multiplicity"],
		AllowedTypesToFlexInsertableTree<TField["allowedTypes"]>
	>,
][_InlineTrick];

/**
 * Adjusts the API for a field based on its Multiplicity.
 * @alpha
 */
export type ApplyMultiplicity<TMultiplicity extends Multiplicity, TypedChild> = {
	[Multiplicity.Forbidden]: undefined;
	[Multiplicity.Optional]: undefined | TypedChild;
	[Multiplicity.Sequence]: TypedChild[];
	[Multiplicity.Single]: TypedChild;
}[TMultiplicity];

/**
 * Takes in `AllowedTypes` and returns a TypedTree union.
 * @alpha
 */
export type AllowedTypesToFlexInsertableTree<T extends AllowedTypes> = [
	T extends readonly LazyItem<TreeNodeSchema>[]
		? InsertableFlexNode<Assume<FlexListToUnion<T>, TreeNodeSchema>>
		: ContextuallyTypedNodeData,
][_InlineTrick];

/**
 * Generate a schema aware API for a single tree schema.
 * @alpha
 */
export type InsertableFlexNode<TSchema extends TreeNodeSchema> = FlattenKeys<
	CollectOptions<
		TSchema extends ObjectNodeSchema<string, infer TFields extends Fields>
			? TypedFields<TFields>
			: TSchema extends FieldNodeSchema<string, infer TField extends TreeFieldSchema>
			? InsertableFlexField<TField>
			: TSchema extends MapNodeSchema<string, infer TField extends TreeFieldSchema>
			? {
					readonly [P in string]: InsertableFlexField<TField>;
			  }
			: EmptyObject,
		TSchema extends LeafNodeSchema<string, infer TValueSchema> ? TValueSchema : undefined,
		TSchema["name"]
	>
>;
