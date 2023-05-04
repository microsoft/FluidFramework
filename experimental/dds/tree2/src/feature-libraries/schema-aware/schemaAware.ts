/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { assert } from "@fluidframework/common-utils";
import { TreeSchemaIdentifier, ValueSchema } from "../../core";
import {
	ContextuallyTypedNodeData,
	MarkedArrayLike,
	typeNameSymbol,
	valueSymbol,
} from "../contextuallyTyped";
import {
	Multiplicity,
	InternalTypedSchemaTypes,
	FieldSchema,
	TreeSchema,
	AllowedTypes,
} from "../modular-schema";
import { UntypedField, UntypedTree, UntypedTreeCore } from "../untypedTree";
import { contextSymbol, typeSymbol } from "../editable-tree";
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
	 * - Unwrap child access, but not top level node
	 */
	Editable,
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
	TValueSchema extends ValueSchema,
	TName,
> = {
	[ApiMode.Flexible]: Record<string, never> extends TTypedFields
		? TypedValue<TValueSchema> | FlexibleObject<TValueSchema, TName>
		: FlexibleObject<TValueSchema, TName> & TTypedFields;
	[ApiMode.Editable]: [Record<string, never>, TValueSchema] extends [
		TTypedFields,
		PrimitiveValueSchema,
	]
		? TypedValue<TValueSchema>
		: {
				[typeNameSymbol]: TName & TreeSchemaIdentifier;
		  } & ValuePropertyFromSchema<TValueSchema> &
				TTypedFields &
				UntypedTreeCore;
	[ApiMode.Wrapped]: {
		[typeNameSymbol]: TName;
		[valueSymbol]: TypedValue<TValueSchema>;
	} & TTypedFields;
	[ApiMode.Simple]: Record<string, never> extends TTypedFields
		? TypedValue<TValueSchema>
		: FlexibleObject<TValueSchema, TName> & TTypedFields;
}[Mode];

/**
 * The name and value part of the `Flexible` API.
 * @alpha
 */
export type FlexibleObject<TValueSchema extends ValueSchema, TName> = [
	InternalTypedSchemaTypes.FlattenKeys<
		{ [typeNameSymbol]?: UnbrandedName<TName> } & InternalTypedSchemaTypes.AllowOptional<
			ValuePropertyFromSchema<TValueSchema>
		>
	>,
][InternalTypedSchemaTypes._dummy];

/**
 * Remove type brand from name.
 * @alpha
 */
export type UnbrandedName<TName> = [
	TName extends infer S & TreeSchemaIdentifier ? S : string,
][InternalTypedSchemaTypes._dummy];

export type IsInput<Mode extends ApiMode> = {
	[ApiMode.Flexible]: true;
	[ApiMode.Editable]: false;
	[ApiMode.Wrapped]: false;
	[ApiMode.Simple]: true;
}[Mode];

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
][InternalTypedSchemaTypes._dummy];

/**
 * `FieldSchemaTypeInfo` to `TypedTree`
 * @alpha
 */
export type TypedField<Mode extends ApiMode, TField extends FieldSchema> = [
	ApplyMultiplicity<
		TField["kind"]["multiplicity"],
		AllowedTypesToTypedTrees<Mode, TField["allowedTypes"]>,
		Mode
	>,
][InternalTypedSchemaTypes._dummy];

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
 * Takes in `AllowedTypes` and returns a TypedTree union.
 * @alpha
 */
export type AllowedTypesToTypedTrees<Mode extends ApiMode, T extends AllowedTypes> = [
	T extends InternalTypedSchemaTypes.FlexList<TreeSchema>
		? InternalTypedSchemaTypes.ArrayToUnion<
				TypeArrayToTypedTreeArray<
					Mode,
					InternalTypedSchemaTypes.Assume<
						InternalTypedSchemaTypes.ConstantFlexListToNonLazyArray<T>,
						readonly TreeSchema[]
					>
				>
		  >
		: UntypedApi<Mode>,
][InternalTypedSchemaTypes._dummy];

/**
 * Takes in `TreeSchema[]` and returns a TypedTree union.
 * @alpha
 */
export type TypeArrayToTypedTreeArray<Mode extends ApiMode, T extends readonly TreeSchema[]> = [
	T extends readonly [infer Head, ...infer Tail]
		? [
				TypedNode<InternalTypedSchemaTypes.Assume<Head, TreeSchema>, Mode>,
				...TypeArrayToTypedTreeArray<
					Mode,
					InternalTypedSchemaTypes.Assume<Tail, readonly TreeSchema[]>
				>,
		  ]
		: [],
][InternalTypedSchemaTypes._dummy];

// TODO: make these more accurate
/**
 * API if type is unknown or Any.
 * @alpha
 */
export type UntypedApi<Mode extends ApiMode> = {
	[ApiMode.Editable]: UntypedTree;
	[ApiMode.Flexible]: ContextuallyTypedNodeData;
	[ApiMode.Simple]: ContextuallyTypedNodeData;
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
// TODO: make InternalTypedSchemaTypes.FlattenKeys work here for recursive types?
export type NodeDataFor<Mode extends ApiMode, TSchema extends TreeSchema> = TypedNode<
	TSchema,
	Mode
>;

/**
 * Check if an `UntypedTreeCore` has a specific schema, and if it does, cast it to use `ApiMode.Editable` with that schema.
 * Provided schema must be included in the schema for the tree being viewed (getting this wrong will error).
 * @alpha
 */
export function downCast<TSchema extends TreeSchema>(
	schema: TSchema,
	tree: UntypedTreeCore | NodeDataFor<ApiMode.Editable, TSchema>,
): tree is NodeDataFor<ApiMode.Editable, TSchema> {
	if (typeof tree !== "object" || tree === null) {
		// TODO: make Editable mode always produce an object for the root, so this is safe.
		// Also remove `| NodeDataFor<ApiMode.Editable, TSchema>,` from input (should compile if thats done).
		return false;
	}
	const treeTyped = tree as UntypedTreeCore;
	const contextSchema = treeTyped[contextSymbol].schema;
	const lookedUp = contextSchema.treeSchema.get(schema.name);
	// TODO: for this to pass, schematized view must have the view schema, not just stored schema.
	assert(lookedUp === schema, "cannot downcase to a schema the tree is not using");

	// TODO: make this actually work
	const matches = treeTyped[typeSymbol] === schema;
	assert(
		matches === (treeTyped[typeSymbol].name === schema.name),
		"schema object identity comparison should match identifier comparison",
	);
	return matches;
}
