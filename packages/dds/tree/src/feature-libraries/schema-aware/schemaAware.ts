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
import {
	FieldSchemaTypeInfo,
	LabeledTreeSchema,
	TreeSchemaTypeInfo,
	/* eslint-disable-next-line import/no-internal-modules */
} from "../modular-schema/typedSchema";
import { typeNameSymbol, valueSymbol } from "../contextuallyTyped";
import { Multiplicity } from "../modular-schema";
// eslint-disable-next-line import/no-internal-modules
import { AllowOptional, ListToKeys } from "../modular-schema/typedSchema/typeUtils";
// eslint-disable-next-line import/no-internal-modules
import { NameSet } from "../modular-schema/typedSchema/outputTypes";
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
	TSchema extends LabeledTreeSchema<any>,
> = TypedTreeFromInfo<TMap, Mode, TSchema["typeInfo"]>;

/**
 * @alpha
 */
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
	[ApiMode.Flexible]: CollectOptionsFlexible<TTypedFields, TValueSchema, TName>;
	[ApiMode.Normalized]: CollectOptionsNormalized<TTypedFields, TValueSchema, TName>;
	[ApiMode.Wrapped]: {
		[typeNameSymbol]: TName;
		[valueSymbol]: TypedValue<TValueSchema>;
	} & TTypedFields;
}[Mode];

/**
 * @alpha
 */
export type CollectOptionsFlexible<TTypedFields, TValueSchema extends ValueSchema, TName> =
	| ({ [typeNameSymbol]?: TName } & ValueFieldTreeFromSchema<TValueSchema> & TTypedFields)
	| (Record<string, never> extends TTypedFields ? TypedValue<TValueSchema> : never);

/**
 * @alpha
 */
export type CollectOptionsNormalized<
	TTypedFields,
	TValueSchema extends ValueSchema,
	TName,
> = Record<string, never> extends TTypedFields
	? TValueSchema extends PrimitiveValueSchema
		? TypedValue<TValueSchema>
		: {
				[typeNameSymbol]: TName & TreeSchemaIdentifier;
		  } & ValueFieldTreeFromSchema<TValueSchema> &
				TTypedFields
	: {
			[typeNameSymbol]: TName & TreeSchemaIdentifier;
	  } & ValueFieldTreeFromSchema<TValueSchema> &
			TTypedFields;

/**
 * `{ [key: string]: FieldSchemaTypeInfo }` to `{ [key: string]: TypedTree }`
 * @alpha
 */
export type TypedFields<
	TMap extends TypedSchemaData,
	Mode extends ApiMode,
	TFields extends { [key: string]: FieldSchemaTypeInfo },
> = AllowOptional<{
	readonly [key in keyof TFields]: ApplyMultiplicity<
		TFields[key]["kind"]["multiplicity"],
		TreeTypesToTypedTreeTypes<TMap, Mode, TFields[key]["types"]>
	>;
}>;

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
	T extends unknown | NameSet,
> = ValidContextuallyTypedNodeData<
	TMap,
	Mode,
	T extends NameSet<infer Names> ? Names : TMap["allTypes"]
>;

/**
 * @alpha
 */
export interface TypedSchemaData extends SchemaDataAndPolicy {
	// TODO: can we use a more specific type here?
	treeSchemaObject: Record<string, any>; // LabeledTreeSchema<any>
	allTypes: readonly string[];
}

/**
 * @alpha
 */
export function typedSchemaData<T extends LabeledTreeSchema<any>[]>(
	globalFieldSchema: ReadonlyMap<GlobalFieldKey, FieldSchema>,
	...t: T
): SchemaDataAndPolicy & {
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
		treeSchema: new Map<TreeSchemaIdentifier, LabeledTreeSchema<any>>(
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
 * @alpha
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
 * @alpha
 */
export type NodeDataFor<
	TMap extends TypedSchemaData,
	Mode extends ApiMode,
	TSchema extends LabeledTreeSchema<any>,
> = ValidContextuallyTypedNodeData<TMap, Mode, readonly [TSchema["typeInfo"]["name"]]>;
