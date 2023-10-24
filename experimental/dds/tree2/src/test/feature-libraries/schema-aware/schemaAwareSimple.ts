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
	TreeFieldSchema,
	TreeNodeSchema,
	AllowedTypes,
	InternalTypedSchemaTypes,
} from "../../..";
import { TreeValue, ValueSchema } from "../../../core";
// eslint-disable-next-line import/no-internal-modules
import { UntypedSequenceField } from "../../../feature-libraries/schema-aware/partlyTyped";

import {
	TypedValueOrUndefined,
	// eslint-disable-next-line import/no-internal-modules
} from "../../../feature-libraries/schema-aware/schemaAwareUtil";
import { Assume, _InlineTrick } from "../../../util";

/**
 * @alpha
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-definitions
export type ValuePropertyFromSchema<TSchema extends ValueSchema> = {
	[valueSymbol]: TreeValue<TSchema>;
};

/**
 * Collects the various parts of the API together.
 * @alpha
 */
export type CollectOptions<TTypedFields, TValueSchema extends ValueSchema | undefined> = Record<
	string,
	never
> extends TTypedFields
	? TypedValueOrUndefined<TValueSchema>
	: TTypedFields;

/**
 * `{ [key: string]: FieldSchemaTypeInfo }` to `{ [key: string]: TypedTree }`
 *
 * TODO:
 * Extend this to support global fields.
 * @alpha
 */
export type TypedFields<TFields extends undefined | { [key: string]: TreeFieldSchema }> = [
	TFields extends { [key: string]: TreeFieldSchema }
		? {
				[key in keyof TFields]: TypedField<TFields[key]>;
		  }
		: Record<string, never>,
][_InlineTrick];

/**
 * `FieldSchemaTypeInfo` to `TypedTree`
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
	T extends InternalTypedSchemaTypes.FlexList<TreeNodeSchema>
		? InternalTypedSchemaTypes.ArrayToUnion<
				TypeArrayToTypedTreeArray<
					Assume<
						InternalTypedSchemaTypes.ConstantFlexListToNonLazyArray<T>,
						readonly TreeNodeSchema[]
					>
				>
		  >
		: unknown,
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
 * Generate a schema aware API for a list of types.
 *
 * @remarks
 * The arguments here are in an order that makes the truncated strings printed for the types more useful.
 * This is important since this generic type is not inlined when recursing.
 * That mens it will show up in IntelliSense and errors.
 * @alpha
 */
export type TypedNode<TSchema extends TreeNodeSchema> = CollectOptions<
	TypedFields<TSchema["objectNodeFieldsObject"]>,
	TSchema["leafValue"]
>;

/**
 * Generate a schema aware API for a single tree schema.
 * @alpha
 */
// TODO: make TypedSchema.FlattenKeys work here for recursive types?
export type SimpleNodeDataFor<TSchema extends TreeNodeSchema> = TypedNode<TSchema>;
