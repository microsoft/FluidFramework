/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { PrimitiveValueSchema, TreeSchemaIdentifier, ValueSchema } from "../../core";
import {
	ContextuallyTypedNodeData,
	MarkedArrayLike,
	PrimitiveValue,
	typeNameSymbol,
	valueSymbol,
} from "../contextuallyTyped";
import { Multiplicity } from "../modular-schema";
import { InternalTypedSchemaTypes, FieldSchema, TreeSchema, AllowedTypes } from "../typed-schema";
import {
	UntypedField,
	UntypedTree,
	UntypedTreeCore,
	contextSymbol,
	typeSymbol,
} from "../untypedTree";
import { Assume, FlattenKeys, _InlineTrick } from "../../util";
import { UntypedOptionalField, UntypedSequenceField, UntypedValueField } from "./partlyTyped";
import { TypedValue, TypedValueOrUndefined } from "./schemaAwareUtil";

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
	TSchema extends ValueSchema ? { [valueSymbol]: TypedValue<TSchema> } : EmptyObject;

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
	 * Similar to what EditableTree uses.
	 * No flexibility in representation.
	 * Fields are unwrapped (see `EditableUnwrapped`).
	 *
	 * TODO: fix ways this differs from editable tree:
	 * - Does not do primary field inlining.
	 * - Primitive node handling might not match.
	 */
	Editable,
	/**
	 * Editable, but primitive nodes are unwrapped to the primitive values.
	 */
	EditableUnwrapped,
	/**
	 * Always use full node objects for everything.
	 *
	 * Fields are still shaped based on their multiplicity.
	 *
	 * TODO: test and fix
	 */
	Wrapped,
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
	[ApiMode.Editable]: {
		[typeNameSymbol]: TName & TreeSchemaIdentifier;
	} & ValuePropertyFromSchema<TValueSchema> &
		TTypedFields &
		UntypedTreeCore;
	[ApiMode.EditableUnwrapped]: [EmptyObject, TValueSchema] extends [
		TTypedFields,
		PrimitiveValueSchema,
	]
		? TypedValueOrUndefined<TValueSchema>
		: // TODO: primary field unwrapping
		  CollectOptions<ApiMode.Editable, TTypedFields, TValueSchema, TName>;
	[ApiMode.Wrapped]: {
		[typeNameSymbol]: TName;
		[valueSymbol]: TypedValueOrUndefined<TValueSchema>;
	} & TTypedFields;
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
	TName extends infer S & TreeSchemaIdentifier ? S : string,
][_InlineTrick];

/**
 * `{ [key: string]: FieldSchemaTypeInfo }` to `{ [key: string]: TypedTree }`
 *
 * In Editable mode, unwraps the fields.
 * @alpha
 */
export type TypedFields<
	Mode extends ApiMode,
	TFields extends undefined | { [key: string]: FieldSchema },
> = [
	TFields extends { [key: string]: FieldSchema }
		? {
				[key in keyof TFields]: TypedField<
					TFields[key],
					Mode extends ApiMode.Editable ? ApiMode.EditableUnwrapped : Mode
				>;
		  }
		: EmptyObject,
][_InlineTrick];

/**
 * `FieldSchema` to `TypedField`. May unwrap to child depending on Mode and FieldKind.
 * @alpha
 */
export type TypedField<TField extends FieldSchema, Mode extends ApiMode = ApiMode.Editable> = [
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
	Mode extends ApiMode,
> = {
	[Multiplicity.Forbidden]: undefined;
	[Multiplicity.Optional]: Mode extends ApiMode.Editable
		? EditableOptionalField<TypedChild>
		: undefined | TypedChild;
	[Multiplicity.Sequence]: Mode extends ApiMode.Editable | ApiMode.EditableUnwrapped
		? EditableSequenceField<TypedChild>
		: TypedChild[];
	[Multiplicity.Value]: Mode extends ApiMode.Editable
		? EditableValueField<TypedChild>
		: TypedChild;
}[TMultiplicity];

// TODO: add strong typed `getNode`.
export type EditableField<TypedChild> = UntypedField & MarkedArrayLike<TypedChild>;

// TODO: add strong typed `getNode`.
/**
 * @alpha
 */
export type EditableSequenceField<TypedChild> = [
	UntypedSequenceField & MarkedArrayLike<TypedChild>,
][_InlineTrick];

/**
 * @alpha
 */
export type EditableValueField<TypedChild> = [
	UntypedValueField & MarkedArrayLike<TypedChild>,
][_InlineTrick];

/**
 * @alpha
 */
export type EditableOptionalField<TypedChild> = [
	UntypedOptionalField & MarkedArrayLike<TypedChild>,
][_InlineTrick];

/**
 * Takes in `AllowedTypes` and returns a TypedTree union.
 * @alpha
 */
export type AllowedTypesToTypedTrees<Mode extends ApiMode, T extends AllowedTypes> = [
	T extends InternalTypedSchemaTypes.FlexList<TreeSchema>
		? InternalTypedSchemaTypes.ArrayToUnion<
				TypeArrayToTypedTreeArray<
					Mode,
					Assume<
						InternalTypedSchemaTypes.ConstantFlexListToNonLazyArray<T>,
						readonly TreeSchema[]
					>
				>
		  >
		: UntypedApi<Mode>,
][_InlineTrick];

/**
 * Takes in `TreeSchema[]` and returns a TypedTree union.
 * @alpha
 */
export type TypeArrayToTypedTreeArray<Mode extends ApiMode, T extends readonly TreeSchema[]> = [
	T extends readonly [infer Head, ...infer Tail]
		? [
				TypedNode<Assume<Head, TreeSchema>, Mode>,
				...TypeArrayToTypedTreeArray<Mode, Assume<Tail, readonly TreeSchema[]>>,
		  ]
		: [],
][_InlineTrick];

// TODO: make these more accurate
/**
 * API if type is unknown or Any.
 * @alpha
 */
export type UntypedApi<Mode extends ApiMode> = {
	[ApiMode.Editable]: UntypedTree;
	[ApiMode.EditableUnwrapped]: UntypedTree | PrimitiveValue;
	[ApiMode.Flexible]: ContextuallyTypedNodeData;
	[ApiMode.Simple]: ContextuallyTypedNodeData;
	[ApiMode.Wrapped]: UntypedTree;
}[Mode];

/**
 * Generate a schema aware API for a single tree schema.
 * @alpha
 */
export type TypedNode<
	TSchema extends TreeSchema,
	Mode extends ApiMode = ApiMode.Editable,
> = FlattenKeys<
	CollectOptions<
		Mode,
		TypedFields<
			Mode extends ApiMode.Editable ? ApiMode.EditableUnwrapped : Mode,
			TSchema["structFieldsObject"]
		>,
		TSchema["leafValue"],
		TSchema["name"]
	>
>;

/**
 * Generate a schema aware API for a single tree schema.
 * @alpha
 * @deprecated Use `TypedNode` instead (and reverse the type parameter order).
 */
export type NodeDataFor<Mode extends ApiMode, TSchema extends TreeSchema> = TypedNode<
	TSchema,
	Mode
>;

/**
 * Check if an `UntypedTreeCore` has a specific schema, and if it does, cast it to use `ApiMode.Editable` with that schema.
 * Provided schema must be included in the schema for the tree being viewed (getting this wrong will error).
 * @alpha
 */
// TODO: tests
export function downCast<TSchema extends TreeSchema>(
	schema: TSchema,
	tree: UntypedTreeCore<any, any>,
): tree is TypedNode<TSchema> {
	assert(typeof tree === "object", 0x72b /* downCast only valid on wrapped nodes */);

	const contextSchema = tree[contextSymbol].schema;
	const lookedUp = contextSchema.treeSchema.get(schema.name);
	// TODO: for this to pass, schematized view must have the view schema, not just stored schema.
	assert(lookedUp === schema, 0x68c /* cannot downcast to a schema the tree is not using */);

	// TODO: make this actually work
	const matches = tree[typeSymbol] === schema;
	assert(
		matches === (tree[typeSymbol].name === schema.name),
		0x68d /* schema object identity comparison should match identifier comparison */,
	);
	return matches;
}
