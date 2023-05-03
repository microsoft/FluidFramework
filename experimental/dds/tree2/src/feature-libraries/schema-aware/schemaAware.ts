/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeSchemaIdentifier, ValueSchema } from "../../core";
import {
	ContextuallyTypedNodeData,
	MarkedArrayLike,
	typeNameSymbol,
	valueSymbol,
} from "../contextuallyTyped";
import {
	Multiplicity,
	TypedSchema,
	FieldSchema,
	TreeSchema,
	AllowedTypes,
	FlexList,
} from "../modular-schema";
import { UntypedField, UntypedTree, UntypedTreeCore } from "../untypedTree";
import { UntypedSequenceField } from "./partlyTyped";
import { PrimitiveValueSchema, TypedValue } from "./schemaAwareUtil";

/**
 * @alpha
 */
export type ValuePropertyFromSchema<TSchema extends ValueSchema> =
	undefined extends TypedValue<TSchema>
		? {
				[valueSymbol]?: TypedValue<TSchema>;
		  }
		: {
				[valueSymbol]: TypedValue<TSchema>;
		  };

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
	 * Nodes are with primitives unwrapped to just the primitive.
	 * Requires types on all node objects.
	 *
	 * TODO: fix ways this differs from editable tree:
	 * - Does not do primary field inlining.
	 * - Primitive node handling might not match.
	 */
	Editable,
	/**
	 * Always use full node objects for everything.
	 *
	 * Fields are still shaped based on their multiplicity.
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
	TValueSchema extends ValueSchema,
	TName,
> = {
	[ApiMode.Flexible]: Record<string, never> extends TTypedFields
		? TypedValue<TValueSchema> | FlexibleObject<TValueSchema, TName>
		: FlexibleObject<TValueSchema, TName> & TypedSchema.AllowOptionalNotFlattened<TTypedFields>;
	[ApiMode.Editable]: [Record<string, never>, TValueSchema] extends [
		TTypedFields,
		PrimitiveValueSchema,
	]
		? TypedValue<TValueSchema>
		: TypedSchema.AllowOptionalNotFlattened<
				{
					[typeNameSymbol]: TName & TreeSchemaIdentifier;
				} & ValuePropertyFromSchema<TValueSchema> &
					TTypedFields
		  > &
				UntypedTreeCore;
	[ApiMode.Wrapped]: {
		[typeNameSymbol]: TName;
		[valueSymbol]: TypedValue<TValueSchema>;
	} & TTypedFields;
	[ApiMode.Simple]: Record<string, never> extends TTypedFields
		? TypedValue<TValueSchema>
		: FlexibleObject<TValueSchema, TName> & TypedSchema.AllowOptionalNotFlattened<TTypedFields>;
}[Mode];

/**
 * The name and value part of the `Flexible` API.
 * @alpha
 */
export type FlexibleObject<TValueSchema extends ValueSchema, TName> = [
	TypedSchema.FlattenKeys<
		{ [typeNameSymbol]?: TName } & TypedSchema.AllowOptional<
			ValuePropertyFromSchema<TValueSchema>
		>
	>,
][TypedSchema._dummy];

/**
 * `{ [key: string]: FieldSchemaTypeInfo }` to `{ [key: string]: TypedTree }`
 *
 * TODO:
 * Extend this to support global fields.
 * @alpha
 */
export type TypedFields<
	Mode extends ApiMode,
	TFields extends undefined | { [key: string]: FieldSchema },
> = [
	TFields extends { [key: string]: FieldSchema }
		? {
				[key in keyof TFields]: TypedField<Mode, TFields[key]>;
		  }
		: Record<string, never>,
][TypedSchema._dummy];

/**
 * `FieldSchemaTypeInfo` to `TypedTree`
 * @alpha
 */
export type TypedField<Mode extends ApiMode, TField extends FieldSchema> = [
	ApplyMultiplicity<
		TField["kind"]["multiplicity"],
		TypeSetToTypedTrees<Mode, TField["allowedTypes"]>,
		Mode
	>,
][TypedSchema._dummy];

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
	[Multiplicity.Optional]: undefined | TypedChild;
	[Multiplicity.Sequence]: Mode extends ApiMode.Editable
		? EditableSequenceField<TypedChild>
		: TypedChild[];
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
 * Takes in `types?: unknown | TypedSchema.NameSet` and returns a TypedTree union.
 * @alpha
 */
export type TypeSetToTypedTrees<Mode extends ApiMode, T extends AllowedTypes> = [
	T extends FlexList<TreeSchema>
		? TypedNode<
				TypedSchema.ArrayToUnion<TypedSchema.FlexListToNonLazyArray<TreeSchema, T>>,
				Mode
		  >
		: UntypedApi<Mode>,
][TypedSchema._dummy];

// TODO: make these more accurate
type UntypedApi<Mode extends ApiMode> = {
	[ApiMode.Editable]: UntypedTree;
	[ApiMode.Flexible]: ContextuallyTypedNodeData;
	[ApiMode.Simple]: unknown;
	[ApiMode.Wrapped]: UntypedTree;
}[Mode];

/**
 * Generate a schema aware API for a list of types.
 *
 * @remarks
 * The arguments here are in an order that makes the truncated strings printed for the types more useful.
 * This is important since this generic type is not inlined when recursing.
 * That mens it will show up in IntelliSense and errors.
 * @alpha
 */
export type TypedNode<TSchema extends TreeSchema, Mode extends ApiMode> = CollectOptions<
	Mode,
	TypedFields<Mode, TSchema["localFieldsObject"]>,
	TSchema["value"],
	TSchema["name"]
>;

/**
 * Generate a schema aware API for a single tree schema.
 * @alpha
 */
export type NodeDataFor<Mode extends ApiMode, TSchema extends TreeSchema> = TypedSchema.FlattenKeys<
	TypedNode<TSchema, Mode>
>;
