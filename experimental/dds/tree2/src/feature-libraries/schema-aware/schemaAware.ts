/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeNodeSchemaIdentifier, TreeValue, ValueSchema } from "../../core";
import { ContextuallyTypedNodeData, typeNameSymbol, valueSymbol } from "../contextuallyTyped";
import { Multiplicity } from "../modular-schema";
import {
	InternalTypedSchemaTypes,
	TreeFieldSchema,
	TreeNodeSchema,
	AllowedTypes,
	LeafNodeSchema,
	ObjectNodeSchema,
	Fields,
	FieldNodeSchema,
	MapNodeSchema,
} from "../typed-schema";
import { Assume, FlattenKeys, _InlineTrick } from "../../util";
import { TypedValueOrUndefined } from "./schemaAwareUtil";

/**
 * Empty Object for use in type computations that should contribute no fields when `&`ed with another type.
 * @alpha
 */
// Using {} instead of interface {} or Record<string, never> for empty object here produces better IntelliSense in the generated types than `Record<string, never>` recommended by the linter.
// Making this a type instead of an interface prevents it from showing up in IntelliSense, and also avoids breaking the typing somehow.
// eslint-disable-next-line @typescript-eslint/ban-types, @typescript-eslint/consistent-type-definitions
export type EmptyObject = {};

/**
 * @alpha
 */
export type ValuePropertyFromSchema<TSchema extends ValueSchema | undefined> =
	TSchema extends ValueSchema ? { [valueSymbol]: TreeValue<TSchema> } : EmptyObject;

/**
 * Collects the various parts of the API together.
 * @alpha
 */
export type CollectOptions<
	TTypedFields,
	TValueSchema extends ValueSchema | undefined,
	TName,
> = TValueSchema extends undefined
	? FlexibleObject<TValueSchema, TName> & TTypedFields
	: TypedValueOrUndefined<TValueSchema>;
/**
 * The name and value part of the `Flexible` API.
 * @alpha
 */
export type FlexibleObject<TValueSchema extends ValueSchema | undefined, TName> = [
	FlattenKeys<
		{ [typeNameSymbol]?: UnbrandedName<TName> } & ValuePropertyFromSchema<TValueSchema>
	>,
][_InlineTrick];

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
				-readonly [key in keyof TFields]: TypedField<TFields[key]>;
		  }
		: EmptyObject,
][_InlineTrick];

/**
 * `TreeFieldSchema` to `TypedField`. May unwrap to child depending on Mode and FieldKind.
 * @alpha
 */
export type TypedField<TField extends TreeFieldSchema> = [
	ApplyMultiplicity<
		TField["kind"]["multiplicity"],
		AllowedTypesToTypedTrees<TField["allowedTypes"]>
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
export type AllowedTypesToTypedTrees<T extends AllowedTypes> = [
	T extends InternalTypedSchemaTypes.FlexList<TreeNodeSchema>
		? InternalTypedSchemaTypes.ArrayToUnion<
				TypeArrayToTypedTreeArray<
					Assume<
						InternalTypedSchemaTypes.ConstantFlexListToNonLazyArray<T>,
						readonly TreeNodeSchema[]
					>
				>
		  >
		: ContextuallyTypedNodeData,
][_InlineTrick];

/**
 * Takes in `TreeNodeSchema[]` and returns a TypedTree union.
 * @alpha
 */
export type TypeArrayToTypedTreeArray<T extends readonly TreeNodeSchema[]> = [
	T extends readonly [infer Head, ...infer Tail]
		? [
				TypedNode<Assume<Head, TreeNodeSchema>>,
				...TypeArrayToTypedTreeArray<Assume<Tail, readonly TreeNodeSchema[]>>,
		  ]
		: [],
][_InlineTrick];

/**
 * Generate a schema aware API for a single tree schema.
 * @alpha
 */
export type TypedNode<TSchema extends TreeNodeSchema> = FlattenKeys<
	CollectOptions<
		TSchema extends ObjectNodeSchema<string, infer TFields extends Fields>
			? TypedFields<TFields>
			: TSchema extends FieldNodeSchema<string, infer TField extends TreeFieldSchema>
			? { "": TypedField<TField> }
			: TSchema extends MapNodeSchema<string, infer TField extends TreeFieldSchema>
			? {
					readonly [P in string]: TypedField<TField>;
			  }
			: EmptyObject,
		TSchema extends LeafNodeSchema<string, infer TValueSchema> ? TValueSchema : undefined,
		TSchema["name"]
	>
>;
