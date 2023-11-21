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
 * Different schema aware APIs that can be generated.
 * @alpha
 */
export const enum ApiMode {
	/**
	 * Allow all forms accepted as ContextuallyTypedNodeData that align with the schema.
	 * Types are optional.
	 *
	 * This also permits some cases which are ambiguous and thus would be rejected by `applyFieldTypesFromContext`.
	 */
	Flexible,
	/**
	 * Simplified version of Flexible.
	 *
	 * Primitive values are always unwrapped.
	 */
	Simple,
}

/**
 * Collects the various parts of the API together.
 * @alpha
 */
export type CollectOptions<
	Mode extends ApiMode,
	TTypedFields,
	TValueSchema extends ValueSchema | undefined,
	TName,
> = {
	[ApiMode.Flexible]: EmptyObject extends TTypedFields
		? TypedValueOrUndefined<TValueSchema> | FlexibleObject<TValueSchema, TName>
		: FlexibleObject<TValueSchema, TName> & TTypedFields;
	[ApiMode.Simple]: EmptyObject extends TTypedFields
		? TypedValueOrUndefined<TValueSchema>
		: FlexibleObject<TValueSchema, TName> & TTypedFields;
}[Mode];

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
export type TypedFields<
	Mode extends ApiMode,
	TFields extends undefined | { readonly [key: string]: TreeFieldSchema },
> = [
	TFields extends { [key: string]: TreeFieldSchema }
		? {
				-readonly [key in keyof TFields]: TypedField<TFields[key], Mode>;
		  }
		: EmptyObject,
][_InlineTrick];

/**
 * `TreeFieldSchema` to `TypedField`. May unwrap to child depending on Mode and FieldKind.
 * @alpha
 */
export type TypedField<TField extends TreeFieldSchema, Mode extends ApiMode> = [
	ApplyMultiplicity<
		TField["kind"]["multiplicity"],
		AllowedTypesToTypedTrees<Mode, TField["allowedTypes"]>,
		Mode
	>,
][_InlineTrick];

/**
 * Adjusts the API for a field based on its Multiplicity.
 * @alpha
 */
export type ApplyMultiplicity<
	TMultiplicity extends Multiplicity,
	TypedChild,
	_Mode extends ApiMode,
> = {
	[Multiplicity.Forbidden]: undefined;
	[Multiplicity.Optional]: undefined | TypedChild;
	[Multiplicity.Sequence]: TypedChild[];
	[Multiplicity.Single]: TypedChild;
}[TMultiplicity];

/**
 * Takes in `AllowedTypes` and returns a TypedTree union.
 * @alpha
 */
export type AllowedTypesToTypedTrees<Mode extends ApiMode, T extends AllowedTypes> = [
	T extends InternalTypedSchemaTypes.FlexList<TreeNodeSchema>
		? InternalTypedSchemaTypes.ArrayToUnion<
				TypeArrayToTypedTreeArray<
					Mode,
					Assume<
						InternalTypedSchemaTypes.ConstantFlexListToNonLazyArray<T>,
						readonly TreeNodeSchema[]
					>
				>
		  >
		: UntypedApi<Mode>,
][_InlineTrick];

/**
 * Takes in `TreeNodeSchema[]` and returns a TypedTree union.
 * @alpha
 */
export type TypeArrayToTypedTreeArray<Mode extends ApiMode, T extends readonly TreeNodeSchema[]> = [
	T extends readonly [infer Head, ...infer Tail]
		? [
				TypedNode<Assume<Head, TreeNodeSchema>, Mode>,
				...TypeArrayToTypedTreeArray<Mode, Assume<Tail, readonly TreeNodeSchema[]>>,
		  ]
		: [],
][_InlineTrick];

// TODO: make these more accurate
/**
 * API if type is unknown or Any.
 * @alpha
 */
export type UntypedApi<Mode extends ApiMode> = {
	[ApiMode.Flexible]: ContextuallyTypedNodeData;
	[ApiMode.Simple]: ContextuallyTypedNodeData;
}[Mode];

/**
 * Generate a schema aware API for a single tree schema.
 * @alpha
 */
export type TypedNode<TSchema extends TreeNodeSchema, Mode extends ApiMode> = FlattenKeys<
	CollectOptions<
		Mode,
		TSchema extends ObjectNodeSchema<string, infer TFields extends Fields>
			? TypedFields<Mode, TFields>
			: TSchema extends FieldNodeSchema<string, infer TField extends TreeFieldSchema>
			? TypedFields<Mode, { "": TField }>
			: EmptyObject,
		TSchema extends LeafNodeSchema<string, infer TValueSchema> ? TValueSchema : undefined,
		TSchema["name"]
	>
>;
