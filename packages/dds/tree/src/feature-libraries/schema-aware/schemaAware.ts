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
 * Example strong type for an API derived from schema.
 *
 * A type similar to this could be used with EditableTree to provide a schema aware API.
 *
 * For now this just supports local fields:
 * @alpha
 */
export type TypedTree<
	TMap extends TypedSchemaData,
	Mode extends ApiMode,
	TSchema extends TypedSchema.LabeledTreeSchema<any>,
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
			TreeTypesToTypedTreeTypes<TMap, Mode, TFields[key]["types"]>
		>;
	},
][TypedSchema._dummy];

/**
 * @alpha
 */
export type ApplyMultiplicity<TMultiplicity extends Multiplicity, TypedChild> = {
	[Multiplicity.Forbidden]: undefined;
	[Multiplicity.Optional]: undefined | TypedChild;
	[Multiplicity.Sequence]: TypedChild[];
	[Multiplicity.Value]: TypedChild;
}[TMultiplicity];

/**
 * Takes in `types?: ReadonlySet<brandedTypeNameUnion>`
 * and returns a TypedTree union.
 * @alpha
 */
export type TreeTypesToTypedTreeTypes<
	TMap extends TypedSchemaData,
	Mode extends ApiMode,
	T extends unknown | TypedSchema.NameSet,
> = [
	TypedNode<T extends TypedSchema.NameSet<infer Names> ? Names : TMap["allTypes"], Mode, TMap>,
][TypedSchema._dummy];

/**
 * @alpha
 */
export interface TypedSchemaData extends SchemaDataAndPolicy<FullSchemaPolicy> {
	// TODO: can we use a more specific type here?
	treeSchemaObject: Record<string, any>; // LabeledTreeSchema<any>
	allTypes: readonly string[];
}

/**
 * @alpha
 */
export function typedSchemaData<T extends TypedSchema.LabeledTreeSchema<any>[]>(
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
		treeSchema: new Map<TreeSchemaIdentifier, TypedSchema.LabeledTreeSchema<any>>(
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
 * This is not an exact match for what `applyFieldTypesFromContext` allows: it does not require discriminators.
 *
 * @remarks
 * The arguments here are in an order that makes the truncated strings printed for the types more useful.
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
 * This is not an exact match for what `applyFieldTypesFromContext` allows: it does not require discriminators.
 * @alpha
 */
export type NodeDataFor<
	TMap extends TypedSchemaData,
	Mode extends ApiMode,
	TSchema extends TypedSchema.LabeledTreeSchema<any>,
> = TypedSchema.FlattenKeys<TypedNode<readonly [TSchema["typeInfo"]["name"]], Mode, TMap>>;
