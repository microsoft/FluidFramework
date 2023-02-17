/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaDataAndPolicy, ValueSchema } from "../core";
import {
	FieldSchemaTypeInfo,
	LabeledTreeSchema,
	TreeSchemaTypeInfo,
	/* eslint-disable-next-line import/no-internal-modules */
} from "./modular-schema/typedSchema";
import { typeNameSymbol, valueSymbol } from "./contextuallyTyped";
import { TypedValue } from "./schemaAwareUtil";
import { Multiplicity } from "./modular-schema";
// eslint-disable-next-line import/no-internal-modules
import { ListToKeys } from "./modular-schema/typedSchema/typeUtils";
// eslint-disable-next-line import/no-internal-modules
import { NameSet } from "./modular-schema/typedSchema/outputTypes";
/**
 * Example strong type for an API derived from schema.
 *
 * A type similar to this could be used with EditableTree to provide a schema aware API.
 *
 * For now this just supports local fields:
 */
export type TypedTree<
	TMap extends TypedSchemaData,
	TSchema extends LabeledTreeSchema<any>,
> = TypedTreeFromInfo<TMap, TSchema["typeInfo"]>;

export type TypedTreeFromInfo<
	TMap extends TypedSchemaData,
	TSchema extends TreeSchemaTypeInfo,
> = CollectOptions<TypedFields<TMap, TSchema["local"]>, TSchema["value"], TSchema["name"]>;

export type ValueFieldTreeFromSchema<TSchema extends ValueSchema> =
	undefined extends TypedValue<TSchema>
		? {
				[valueSymbol]?: TypedValue<TSchema>;
		  }
		: {
				[valueSymbol]: TypedValue<TSchema>;
		  };

type CollectOptions<TTypedFields, TValueSchema extends ValueSchema, TName> =
	| (Record<string, never> extends TTypedFields ? TypedValue<TValueSchema> : never)
	| (TTypedFields & {
			[typeNameSymbol]?: TName;
	  } & ValueFieldTreeFromSchema<TValueSchema>);

/**
 * `{ [key: string]: FieldSchemaTypeInfo }` to `{ [key: string]: TypedTree }`
 */
export type TypedFields<
	TMap extends TypedSchemaData,
	TFields extends { [key: string]: FieldSchemaTypeInfo },
> = {
	readonly [key in keyof TFields]: ApplyMultiplicity<
		TFields[key]["kind"]["multiplicity"],
		TreeTypesToTypedTreeTypes<TMap, TFields[key]["types"]>
	>;
};

type ApplyMultiplicity<TMultiplicity extends Multiplicity, TypedChild> = {
	[Multiplicity.Forbidden]: never;
	[Multiplicity.Optional]: undefined | TypedChild; // TODO: need to refactor this to allow field to be omitted not just undefined.
	[Multiplicity.Sequence]: readonly TypedChild[];
	[Multiplicity.Value]: TypedChild;
}[TMultiplicity];

/**
 * Takes in `types?: ReadonlySet<brandedTypeNameUnion>`
 * and returns a TypedTree union.
 */
export type TreeTypesToTypedTreeTypes<
	TMap extends TypedSchemaData,
	T extends unknown | NameSet,
> = T extends NameSet<infer Names> ? ValidContextuallyTypedNodeData<TMap, Names> : AnyTree;

interface AnyTree {}

type ValuesOf<T> = T[keyof T];

interface TypedSchemaData extends SchemaDataAndPolicy {
	// eslint-disable-next-line @typescript-eslint/ban-types
	treeSchemaObject: {}; // readonly [key: string]: TreeSchemaTypeInfo
}

/**
 * This is not an exact match for what `applyFieldTypesFromContext` allows: it does not require discriminators.
 */
export type ValidContextuallyTypedNodeData<
	TMap extends TypedSchemaData,
	TNames extends readonly string[],
> = ValuesOf<{
	[Property in keyof ListToKeys<TNames, 0>]: TMap["treeSchemaObject"] extends {
		[key in Property]: any;
	}
		? TypedTree<TMap, TMap["treeSchemaObject"][Property]>
		: never;
}>;

/**
 * This is not an exact match for what `applyFieldTypesFromContext` allows: it does not require discriminators.
 */
export type NodeDataFor<
	TMap extends TypedSchemaData,
	TSchema extends LabeledTreeSchema<any>,
> = ValidContextuallyTypedNodeData<TMap, readonly [TSchema["typeInfo"]["name"]]>;
