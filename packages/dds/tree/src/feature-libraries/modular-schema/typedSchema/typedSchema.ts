/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	GlobalFieldKey,
	GlobalFieldKeySymbol,
	keyFromSymbol,
	Named,
	treeSchema,
	TreeSchemaBuilder,
	TreeSchemaIdentifier,
	ValueSchema,
} from "../../../core";
import { brand } from "../../../util";
import { forbidden } from "../../defaultFieldKinds";
import { namedTreeSchema } from "../../viewSchemaUtil";
import { FieldKind } from "../fieldKind";
import { FieldSchemaTypeInfo, LabeledTreeSchema, NameSet, TreeSchemaTypeInfo } from "./outputTypes";
import { ArrayToUnion, AsNames, WithDefault } from "./typeUtils";

/**
 * APIs for building typescript types and schema together.
 * This is an example schema language which can support schema aware APIs in typescript without code gen.
 */

/**
 * Object for capturing information about a TreeSchema for use at both compile time and runtime.
 */
export interface TypedTreeSchemaBuilder {
	readonly name: string;
	readonly local?: { readonly [key: string]: FieldSchemaTypeInfo };
	readonly global?: (GlobalFieldKeySymbol | Named<GlobalFieldKeySymbol>)[];
	readonly extraLocalFields?: FieldSchemaTypeInfo;
	readonly extraGlobalFields?: boolean;
	readonly value?: ValueSchema;
}

type EmptyObject = Readonly<Record<string, never>>;

export interface TreeInfoFromBuilder<T extends TypedTreeSchemaBuilder> {
	readonly name: T["name"];
	readonly local: WithDefault<T["local"], EmptyObject>;
	readonly global: AsNames<WithDefault<T["global"], []>, GlobalFieldKeySymbol>;
	readonly extraLocalFields: WithDefault<T["extraLocalFields"], typeof emptyField>;
	readonly extraGlobalFields: WithDefault<T["extraGlobalFields"], false>;
	readonly value: WithDefault<T["value"], ValueSchema.Nothing>;
}

/**
 * Builds a TreeSchema with the type information also captured in the
 * typescript type to allow for deriving schema aware APIs.
 */
export function typedTreeSchema<T extends TypedTreeSchemaBuilder>(
	t: T,
): LabeledTreeSchema<TreeInfoFromBuilder<T>> {
	const data: TreeSchemaBuilder = {
		localFields: t.local,
		globalFields:
			t.global?.map(
				(key): GlobalFieldKey => keyFromSymbol(typeof key === "symbol" ? key : key.name),
			) ?? [],
		extraLocalFields: t.extraLocalFields ?? emptyField,
		extraGlobalFields: t.extraGlobalFields,
		value: t.value,
	};
	return {
		name: brand<TreeSchemaIdentifier>(t.name),
		...treeSchema(data),
	} as unknown as LabeledTreeSchema<TreeInfoFromBuilder<T>>;
}

/**
 * Builds a FieldSchema with the type information also captured in the
 * typescript type to allow for deriving schema aware APIs.
 */
export function typedFieldSchema<
	TKind extends FieldKind,
	TTypes extends (string | Named<string>)[],
>(kind: TKind, ...typeArray: TTypes): { kind: TKind; types: NameSet<AsNames<TTypes>> } {
	const types = nameSet(...typeArray);
	return { kind, types };
}

/**
 * Builds a FieldSchema with the type information also captured in the
 * typescript type to allow for deriving schema aware APIs.
 *
 * For fields with unrestricted polymorphism (meaning all child types are allowed).
 */
export function unrestrictedFieldSchema<TKind extends FieldKind>(kind: TKind): { kind: TKind } {
	return { kind };
}

function extractNames<T extends (string | Named<string>)[]>(
	items: T,
): AsNames<T> & Iterable<ArrayToUnion<AsNames<T>>> {
	return items.map((item) =>
		typeof item === "string" ? item : item.name,
	) as unknown as AsNames<T> & Iterable<ArrayToUnion<AsNames<T>>>;
}

export function nameSetSimple<T extends [...string[]]>(...names: T): NameSet<T> {
	return new Set(names) as unknown as NameSet<T>;
}

export function nameSet<T extends [...(string | Named<string>)[]]>(
	...names: T
): NameSet<AsNames<T>> {
	return new Set(extractNames(names)) as unknown as NameSet<AsNames<T>>;
}

/**
 * Builds a TreeSchema with the type information also captured in the
 * typescript type to allow for deriving schema aware APIs.
 */
export function typedTreeSchemaFromInfo<T extends TreeSchemaTypeInfo>(t: T): LabeledTreeSchema<T> {
	return namedTreeSchema({ ...t, name: brand(t.name) }) as LabeledTreeSchema<T>;
}

/**
 * Schema for a field which must always be empty.
 */
export const emptyField = typedFieldSchema(forbidden);

/**
 * Placeholder used for errors inferring types.
 * Used instead of "never" since "never" can propagate in hard to track ways through type meta programming.
 */
export type InferError = "InferError";
