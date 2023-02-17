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
	Mode extends ApiMode,
	TSchema extends LabeledTreeSchema<any>,
> = TypedTreeFromInfo<TMap, Mode, TSchema["typeInfo"]>;

export type TypedTreeFromInfo<
	TMap extends TypedSchemaData,
	Mode extends ApiMode,
	TSchema extends TreeSchemaTypeInfo,
> = CollectOptions<
	Mode,
	TypedFields<TMap, Mode, TSchema["local"]>,
	TSchema["value"],
	TSchema["name"]
>;

export type ValueFieldTreeFromSchema<TSchema extends ValueSchema> =
	undefined extends TypedValue<TSchema>
		? {
				[valueSymbol]?: TypedValue<TSchema>;
		  }
		: {
				[valueSymbol]: TypedValue<TSchema>;
		  };

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

type CollectOptions<Mode extends ApiMode, TTypedFields, TValueSchema extends ValueSchema, TName> = {
	[ApiMode.Flexible]: CollectOptionsFlexible<TTypedFields, TValueSchema, TName>;
	[ApiMode.Normalized]: CollectOptionsNormalized<TTypedFields, TValueSchema, TName>;
	[ApiMode.Wrapped]: TTypedFields & {
		[typeNameSymbol]: TName;
		[valueSymbol]: TypedValue<TValueSchema>;
	};
}[Mode];

type CollectOptionsFlexible<TTypedFields, TValueSchema extends ValueSchema, TName> =
	| (Record<string, never> extends TTypedFields ? TypedValue<TValueSchema> : never)
	| (TTypedFields & {
			[typeNameSymbol]?: TName;
	  } & ValueFieldTreeFromSchema<TValueSchema>);

type CollectOptionsNormalized<TTypedFields, TValueSchema extends ValueSchema, TName> = Record<
	string,
	never
> extends TTypedFields
	? TypedValue<TValueSchema>
	: TTypedFields & {
			[typeNameSymbol]: TName;
	  } & ValueFieldTreeFromSchema<TValueSchema>;

/**
 * `{ [key: string]: FieldSchemaTypeInfo }` to `{ [key: string]: TypedTree }`
 */
export type TypedFields<
	TMap extends TypedSchemaData,
	Mode extends ApiMode,
	TFields extends { [key: string]: FieldSchemaTypeInfo },
> = {
	readonly [key in keyof TFields]: ApplyMultiplicity<
		TFields[key]["kind"]["multiplicity"],
		TreeTypesToTypedTreeTypes<TMap, Mode, TFields[key]["types"]>
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
	Mode extends ApiMode,
	T extends unknown | NameSet,
> = ValidContextuallyTypedNodeData<
	TMap,
	Mode,
	T extends NameSet<infer Names> ? Names : TMap["allTypes"]
>;

type ValuesOf<T> = T[keyof T];

interface TypedSchemaData extends SchemaDataAndPolicy {
	// eslint-disable-next-line @typescript-eslint/ban-types
	treeSchemaObject: {}; // readonly [key: string]: TreeSchemaTypeInfo
	allTypes: readonly string[];
}

// export function typedSchemaData<T extends LabeledTreeSchema<any>[]>(...t: T): {
// 	treeSchemaObject: {},
// 	allTypes:
// } {

// }

/**
 * This is not an exact match for what `applyFieldTypesFromContext` allows: it does not require discriminators.
 */
export type ValidContextuallyTypedNodeData<
	TMap extends TypedSchemaData,
	Mode extends ApiMode,
	TNames extends readonly string[],
> = ValuesOf<{
	[Property in keyof ListToKeys<TNames, 0>]: TMap["treeSchemaObject"] extends {
		[key in Property]: any;
	}
		? TypedTree<TMap, Mode, TMap["treeSchemaObject"][Property]>
		: never;
}>;

/**
 * This is not an exact match for what `applyFieldTypesFromContext` allows: it does not require discriminators.
 */
export type NodeDataFor<
	TMap extends TypedSchemaData,
	Mode extends ApiMode,
	TSchema extends LabeledTreeSchema<any>,
> = ValidContextuallyTypedNodeData<TMap, Mode, readonly [TSchema["typeInfo"]["name"]]>;
