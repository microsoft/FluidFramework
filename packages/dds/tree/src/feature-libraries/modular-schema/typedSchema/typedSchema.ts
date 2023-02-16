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
import { FieldSchemaTypeInfo, LabeledTreeSchema, TreeSchemaTypeInfo } from "./outputTypes";
import { ArrayToSet, ArrayToUnion, AsBrandedNames, AsNames, WithDefault } from "./typeUtils";

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
	readonly global?: readonly (GlobalFieldKeySymbol | Named<GlobalFieldKeySymbol>)[];
	readonly extraLocalFields?: FieldSchemaTypeInfo;
	readonly extraGlobalFields?: boolean;
	readonly value?: ValueSchema;
}

/**
 * Object for capturing information about a FieldSchema for use at both compile time and runtime.
 */
export interface TypedFieldSchemaTypeBuilder {
	readonly types?: readonly (string | Named<string>)[];
	readonly kind: FieldKind;
}

type EmptyObject = Readonly<Record<string, never>>;

export interface TreeInfoFromBuilder<T extends TypedTreeSchemaBuilder> {
	readonly name: T["name"] & TreeSchemaIdentifier;
	readonly local: WithDefault<T["local"], EmptyObject>;
	readonly global: AsNames<WithDefault<T["global"], readonly []>, GlobalFieldKeySymbol> &
		readonly GlobalFieldKeySymbol[];
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
	TTypes extends readonly (string | Named<TreeSchemaIdentifier>)[],
>(
	kind: TKind,
	...typeArray: TTypes
): { kind: TKind; types: ArrayToSet<AsBrandedNames<TTypes, TreeSchemaIdentifier>> } {
	const typeNames: Iterable<ArrayToUnion<AsBrandedNames<TTypes, TreeSchemaIdentifier>>> =
		extractNames(typeArray);
	const types: ArrayToSet<AsBrandedNames<TTypes, TreeSchemaIdentifier>> = new Set<
		ArrayToUnion<AsBrandedNames<TTypes, TreeSchemaIdentifier>>
	>(typeNames);
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

function extractNames<T extends readonly (string | Named<string>)[]>(
	items: T,
): AsNames<T> & Iterable<ArrayToUnion<AsNames<T>>> {
	return items.map((item) =>
		typeof item === "string" ? item : item.name,
	) as unknown as AsNames<T> & Iterable<ArrayToUnion<AsNames<T>>>;
}

/**
 * Builds a TreeSchema with the type information also captured in the
 * typescript type to allow for deriving schema aware APIs.
 */
export function typedTreeSchemaFromInfo<T extends TreeSchemaTypeInfo>(t: T): LabeledTreeSchema<T> {
	return namedTreeSchema(t) as LabeledTreeSchema<T>;
}

/**
 * Returns the `TreeSchemaTypeInfo` associated with `T`.
 */
export type TypeInfo<T extends LabeledTreeSchema<any>> = T extends LabeledTreeSchema<infer R>
	? R
	: InferError;

/**
 * Schema for a field which must always be empty.
 */
export const emptyField = typedFieldSchema(forbidden);

/**
 * Placeholder used for errors inferring types.
 * Used instead of "never" since "never" can propagate in hard to track ways through type meta programming.
 */
export type InferError = "InferError";
