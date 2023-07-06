/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// This file is a simplified subset of schemaAware.ts which can be used to investigate typing issues which are too hard to diagnose in the full version.

import {
	MarkedArrayLike,
	UntypedField,
	valueSymbol,
	Multiplicity,
	FieldSchema,
	TreeSchema,
	AllowedTypes,
	InternalTypedSchemaTypes,
} from "../../..";
import { ValueSchema } from "../../../core";
// eslint-disable-next-line import/no-internal-modules
import { UntypedSequenceField } from "../../../feature-libraries/schema-aware/partlyTyped";
// eslint-disable-next-line import/no-internal-modules
import { TypedValue } from "../../../feature-libraries/schema-aware/schemaAwareUtil";
import { Assume, _InlineTrick } from "../../../util";

/**
 * @alpha
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type ValuePropertyFromSchema<TSchema extends ValueSchema> = {
	[valueSymbol]: TypedValue<TSchema>;
};

/**
 * Collects the various parts of the API together.
 * @alpha
 */
export type CollectOptions<TTypedFields, TValueSchema extends ValueSchema> = Record<
	string,
	never
> extends TTypedFields
	? TypedValue<TValueSchema>
	: TTypedFields;

/**
 * `{ [key: string]: FieldSchemaTypeInfo }` to `{ [key: string]: TypedTree }`
 *
 * TODO:
 * Extend this to support global fields.
 * @alpha
 */
export type TypedFields<TFields extends undefined | { [key: string]: FieldSchema }> = [
	TFields extends { [key: string]: FieldSchema }
		? {
				[key in keyof TFields]: TypedField<TFields[key]>;
		  }
		: Record<string, never>,
][_InlineTrick];

/**
 * `FieldSchemaTypeInfo` to `TypedTree`
 * @alpha
 */
export type TypedField<TField extends FieldSchema> = [
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
	[Multiplicity.Value]: TypedChild;
}[TMultiplicity];

// TODO: add strong typed `getNode`.
export type EditableField<TypedChild> = UntypedField & MarkedArrayLike<TypedChild>;

// TODO: add strong typed `getNode`.
/**
 * @alpha
 */
export type EditableSequenceField<TypedChild> = UntypedSequenceField & MarkedArrayLike<TypedChild>;

/**
 * Takes in `AllowedTypes` and returns a TypedTree union.
 * @alpha
 */
export type AllowedTypesToTypedTrees<T extends AllowedTypes> = [
	T extends InternalTypedSchemaTypes.FlexList<TreeSchema>
		? InternalTypedSchemaTypes.ArrayToUnion<
				TypeArrayToTypedTreeArray<
					Assume<
						InternalTypedSchemaTypes.ConstantFlexListToNonLazyArray<T>,
						readonly TreeSchema[]
					>
				>
		  >
		: unknown,
][_InlineTrick];

/**
 * Takes in `TreeSchema[]` and returns a TypedTree union.
 * @alpha
 */
export type TypeArrayToTypedTreeArray<T extends readonly TreeSchema[]> = [
	T extends readonly [infer Head, ...infer Tail]
		? [
				TypedNode<Assume<Head, TreeSchema>>,
				...TypeArrayToTypedTreeArray<Assume<Tail, readonly TreeSchema[]>>,
		  ]
		: [],
][_InlineTrick];

/**
 * Generate a schema aware API for a list of types.
 *
 * @remarks
 * The arguments here are in an order that makes the truncated strings printed for the types more useful.
 * This is important since this generic type is not inlined when recursing.
 * That mens it will show up in IntelliSense and errors.
 * @alpha
 */
export type TypedNode<TSchema extends TreeSchema> = CollectOptions<
	TypedFields<TSchema["localFieldsObject"]>,
	TSchema["value"]
>;

/**
 * Generate a schema aware API for a single tree schema.
 * @alpha
 */
// TODO: make TypedSchema.FlattenKeys work here for recursive types?
export type SimpleNodeDataFor<TSchema extends TreeSchema> = TypedNode<TSchema>;
