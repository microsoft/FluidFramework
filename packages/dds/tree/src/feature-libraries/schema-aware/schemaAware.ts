/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FieldSchema,
	GlobalFieldKey,
	SchemaDataAndPolicy,
	TreeSchemaIdentifier,
	ValueSchema,
} from "../../core";
import { typeNameSymbol, valueSymbol } from "../contextuallyTyped";
import { FullSchemaPolicy, Multiplicity, TypedSchema } from "../modular-schema";
import { defaultSchemaPolicy } from "../defaultSchema";
import { NamesFromSchema, PrimitiveValueSchema, TypedValue, ValuesOf } from "./schemaAwareUtil";

/**
 * Schema aware API for a specific Schema.
 *
 * `Mode` specifies what API to provide.
 * `TMap` provides access to all the schema and is used to look up child schema.
 * `TSchema` specifies which type of node to generate the API for.
 * @alpha
 */
export type TypedTree<
	TMap extends TypedSchemaData,
	Mode extends ApiMode,
	TSchema extends TypedSchema.LabeledTreeSchema,
> = CollectOptions<
	Mode,
	TypedFields<TMap, Mode, TSchema["typeInfo"]["local"]>,
	TSchema["typeInfo"]["value"],
	TSchema["typeInfo"]["name"]
>;

/**
 * @alpha
 */
export type ValueFieldTreeFromSchema<TSchema extends ValueSchema> =
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
	Normalized,
	/**
	 * Always use full node objects for everything.
	 *
	 * Fields are still shaped based on their multiplicity.
	 */
	Wrapped,
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
	[ApiMode.Normalized]: [Record<string, never>, TValueSchema] extends [
		TTypedFields,
		PrimitiveValueSchema,
	]
		? TypedValue<TValueSchema>
		: TypedSchema.AllowOptionalNotFlattened<
				{
					[typeNameSymbol]: TName & TreeSchemaIdentifier;
				} & ValueFieldTreeFromSchema<TValueSchema> &
					TTypedFields
		  >;
	[ApiMode.Wrapped]: {
		[typeNameSymbol]: TName;
		[valueSymbol]: TypedValue<TValueSchema>;
	} & TTypedFields;
}[Mode];

/**
 * The name and value part of the `Flexible` API.
 * @alpha
 */
export type FlexibleObject<TValueSchema extends ValueSchema, TName> = [
	TypedSchema.FlattenKeys<
		{ [typeNameSymbol]?: TName } & TypedSchema.AllowOptional<
			ValueFieldTreeFromSchema<TValueSchema>
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
	TMap extends TypedSchemaData,
	Mode extends ApiMode,
	TFields extends { [key: string]: TypedSchema.FieldSchemaTypeInfo },
> = [
	{
		[key in keyof TFields]: ApplyMultiplicity<
			TFields[key]["kind"]["multiplicity"],
			TypeSetToTypedTrees<TMap, Mode, TFields[key]["types"]>
		>;
	},
][TypedSchema._dummy];

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

/**
 * Takes in `types?: unknown | TypedSchema.NameSet` and returns a TypedTree union.
 * @alpha
 */
export type TypeSetToTypedTrees<
	TMap extends TypedSchemaData,
	Mode extends ApiMode,
	T extends unknown | TypedSchema.NameSet,
> = [
	TypedNode<T extends TypedSchema.NameSet<infer Names> ? Names : TMap["allTypes"], Mode, TMap>,
][TypedSchema._dummy];

/**
 * Interface which strongly typed schema collections extend.
 * @alpha
 */
export interface TypedSchemaData extends SchemaDataAndPolicy<FullSchemaPolicy> {
	// TODO: can we use a more specific type here?
	treeSchemaObject: Record<string, any>; // LabeledTreeSchema
	allTypes: readonly string[];
}

/**
 * Collects schema into a `TypedSchemaData` without losing type information.
 *
 * TODO:
 * 1. Extend this to support global fields.
 * 2. Extend this to better support use in libraries
 * which only have partial knowledge of what schema exist.
 * Currently unbounded polymorphism is not correct in that case.
 *
 *
 * @alpha
 */
export function typedSchemaData<T extends TypedSchema.LabeledTreeSchema[]>(
	globalFieldSchema: ReadonlyMap<GlobalFieldKey, FieldSchema>,
	...t: T
): SchemaDataAndPolicy<FullSchemaPolicy> & {
	treeSchemaObject: {
		[schema in T[number] as schema["typeInfo"]["name"]]: schema;
	};

	allTypes: NamesFromSchema<T>;
} {
	const treeSchemaObject = {};
	const allTypes = [];
	for (const schema of t) {
		Object.defineProperty(treeSchemaObject, schema.name, {
			enumerable: true,
			configurable: true,
			writable: false,
			value: schema,
		});
		allTypes.push(schema.name);
	}
	const schemaData = {
		policy: defaultSchemaPolicy,
		globalFieldSchema,
		treeSchema: new Map<TreeSchemaIdentifier, TypedSchema.LabeledTreeSchema>(
			t.map((schema) => [schema.name, schema]),
		),
		treeSchemaObject: treeSchemaObject as {
			[schema in T[number] as schema["typeInfo"]["name"]]: schema;
		},
		allTypes: allTypes as NamesFromSchema<T>,
	} as const;
	return schemaData;
}

/**
 * Generate a schema aware API for a list of types.
 *
 * @remarks
 * The arguments here are in an order that makes the truncated strings printed for the types more useful.
 * This is important since this generic type is not inlined when recursing.
 * That mens it will show up in IntelliSense and errors.
 * @alpha
 */
export type TypedNode<
	TNames extends readonly string[],
	Mode extends ApiMode,
	TMap extends TypedSchemaData,
> = ValuesOf<{
	[Property in keyof TypedSchema.ListToKeys<TNames, 0>]: TMap["treeSchemaObject"] extends {
		[key in Property]: any;
	}
		? TypedTree<TMap, Mode, TMap["treeSchemaObject"][Property]>
		: never;
}>;

/**
 * Generate a schema aware API for a single tree schema.
 * @alpha
 */
export type NodeDataFor<
	TMap extends TypedSchemaData,
	Mode extends ApiMode,
	TSchema extends TypedSchema.LabeledTreeSchema,
> = TypedSchema.FlattenKeys<TypedNode<readonly [TSchema["typeInfo"]["name"]], Mode, TMap>>;
