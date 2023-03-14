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
import { ArrayToUnion, AsNames, UnbrandList, WithDefault } from "./typeUtils";

/**
 * APIs for building typescript types and schema together.
 * This is an example schema language which can support schema aware APIs in typescript without code gen.
 */

/**
 * Object for capturing information about a TreeSchema for use at both compile time and runtime.
 * @alpha
 */
export interface TypedTreeSchemaBuilder {
	readonly local?: { readonly [key: string]: FieldSchemaTypeInfo };
	readonly global?: (GlobalFieldKeySymbol | Named<GlobalFieldKeySymbol>)[];
	readonly extraLocalFields?: FieldSchemaTypeInfo;
	readonly extraGlobalFields?: boolean;
	readonly value?: ValueSchema;
}

/**
 * @alpha
 */
export interface TreeInfoFromBuilder<T extends TypedTreeSchemaBuilder, TName extends string> {
	readonly name: TName;
	readonly local: WithDefault<T["local"], Record<string, never>>;
	readonly global: AsNames<WithDefault<T["global"], []>, GlobalFieldKeySymbol>;
	readonly extraLocalFields: WithDefault<T["extraLocalFields"], typeof emptyField>;
	readonly extraGlobalFields: WithDefault<T["extraGlobalFields"], false>;
	readonly value: WithDefault<T["value"], ValueSchema.Nothing>;
}

/**
 * Builds a TreeSchema with the type information also captured in the
 * typescript type to allow for deriving schema aware APIs.
 *
 * @remarks
 * The name is passed is separate instead of part of the builder to the caller does not have to
 * do "as const" after the name for its type to be captured properly.
 *
 * @alpha
 */
export function typedTreeSchema<T extends TypedTreeSchemaBuilder, TName extends string>(
	name: TName,
	t: T,
): LabeledTreeSchema<TreeInfoFromBuilder<T, TName>> {
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
	// TreeInfoFromBuilder<T, TName>
	const typeInfo: TreeSchemaTypeInfo = {
		name,
		local: t.local ?? {},
		global: extractNames(t.global ?? []),
		extraLocalFields: t.extraLocalFields ?? emptyField,
		extraGlobalFields: t.extraGlobalFields ?? false,
		value: t.value ?? ValueSchema.Nothing,
	};
	return {
		name: brand<TreeSchemaIdentifier>(name),
		...treeSchema(data),
		typeInfo,
	} as unknown as LabeledTreeSchema<TreeInfoFromBuilder<T, TName>>;
}

/**
 * Builds a FieldSchema with the type information also captured in the
 * typescript type to allow for deriving schema aware APIs.
 *
 * @remarks
 * The typing here explicitly forbids passing no types: no types would make a field that didn't allow anything.
 * While the underlying system does support such fields (which can be useful if planning to modify their schema later),
 * usually what is instead desired is a field which allows any child type.
 * For that see {@link TypedSchema#fieldUnrestricted}.
 *
 * @alpha
 */
export function typedFieldSchema<
	TKind extends FieldKind,
	TTypes extends [string | Named<string>, ...(string | Named<string>)[]],
>(
	kind: TKind,
	...typeArray: TTypes
): { kind: TKind; types: NameSet<UnbrandList<AsNames<TTypes>, TreeSchemaIdentifier>> } {
	const types = nameSet(...typeArray);
	return { kind, types };
}

/**
 * Builds a FieldSchema with the type information also captured in the
 * typescript type to allow for deriving schema aware APIs.
 *
 * For fields with unrestricted polymorphism (meaning all child types are allowed).
 * @alpha
 */
export function unrestrictedFieldSchema<TKind extends FieldKind>(kind: TKind): { kind: TKind } {
	return { kind };
}

function extractNames<T extends (string | symbol | Named<string | symbol>)[]>(
	items: T,
): AsNames<T> & Iterable<ArrayToUnion<AsNames<T>>> {
	return items.map((item) =>
		typeof item === "object" ? item.name : item,
	) as unknown as AsNames<T> & Iterable<ArrayToUnion<AsNames<T>>>;
}

export function nameSetSimple<T extends [...string[]]>(...names: T): NameSet<T> {
	return new Set(names) as unknown as NameSet<T>;
}

/**
 * Gets a set of names from a list of named objects or names.
 * @alpha
 */
export function nameSet<T extends [...(string | Named<string>)[]]>(
	...names: T
): NameSet<UnbrandList<AsNames<T>, TreeSchemaIdentifier>> {
	return new Set(extractNames(names)) as unknown as NameSet<
		UnbrandList<AsNames<T>, TreeSchemaIdentifier>
	>;
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
 * @alpha
 */
export const emptyField = unrestrictedFieldSchema(forbidden);
