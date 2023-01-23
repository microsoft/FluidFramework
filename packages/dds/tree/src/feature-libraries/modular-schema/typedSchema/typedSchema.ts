/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fieldSchema, Named, TreeSchemaIdentifier, ValueSchema } from "../../../core";
import { brand } from "../../../util";
import { forbidden } from "../../defaultFieldKinds";
import { namedTreeSchema } from "../../viewSchemaUtil";
import { FieldKind } from "../fieldKind";
import {
    FieldSchemaTypeInfo,
    LabeledFieldSchema,
    LabeledTreeSchema,
    MapToken,
    TreeSchemaTypeInfo,
} from "./outputTypes";
import { AsNames, ListToKeys, WithDefault } from "./typeUtils";

/**
 * APIs for building typescript types and schema together.
 * This is an example schema language which can support schema aware APIs in typescript without code gen.
 */

/**
 * Object for capturing information about a TreeSchema for use at both compile time and runtime.
 */
export interface TypedTreeSchemaBuilder {
    readonly name: string;
    readonly local?: { readonly [key: string]: LabeledFieldSchema<any> };
    readonly global?: readonly (string | Named<string>)[];
    readonly extraLocalFields?: LabeledFieldSchema<any>;
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

const empty = [] as const;
type EmptyStringArray = typeof empty & readonly string[];

type EmptyObject = Readonly<Record<string, never>>;

export const typedEmptyLocalField = typedFieldSchema(forbidden, []);

export interface TreeInfoFromBuilder<T extends TypedTreeSchemaBuilder> {
    readonly name: T["name"] & TreeSchemaIdentifier;
    readonly local: WithDefault<T["local"], EmptyObject>;
    readonly global: ProcessNames<WithDefault<T["global"], EmptyStringArray>>;
    readonly extraLocalFields: WithDefault<T["extraLocalFields"], typeof typedEmptyLocalField>;
    readonly extraGlobalFields: WithDefault<T["extraGlobalFields"], false>;
    readonly value: WithDefault<T["value"], ValueSchema.Nothing>;
}

export interface FieldInfoFromBuilder<T extends TypedFieldSchemaTypeBuilder> {
    readonly kind: T["kind"];
    readonly types: T["types"] extends undefined
        ? undefined
        : ProcessNames<WithDefault<T["types"], never>>;
}

type ProcessNames<T extends readonly (string | Named<string>)[]> = ListToKeys<AsNames<T>, MapToken>;

/**
 * Builds a TreeSchema with the type information also captured in the
 * typescript type to allow for deriving schema aware APIs.
 */
export function typedTreeSchema<T extends TypedTreeSchemaBuilder>(
    t: T,
): LabeledTreeSchema<TreeInfoFromBuilder<T>> {
    return namedTreeSchema({ ...t, name: brand(t.name) }) as LabeledTreeSchema<
        TreeInfoFromBuilder<T>
    >;
}

/**
 * Builds a FieldSchema with the type information also captured in the
 * typescript type to allow for deriving schema aware APIs.
 */
export function typedFieldSchema<
    TKind extends FieldKind,
    TTypes extends undefined | readonly (string | Named<string>)[],
>(
    kind: TKind,
    types?: TTypes,
): LabeledFieldSchema<FieldInfoFromBuilder<{ kind: TKind; types: TTypes }>> {
    return fieldSchema(
        kind,
        types === undefined ? undefined : (extractNames(types) as TreeSchemaIdentifier[]),
    );
}

function extractNames(items: readonly (string | Named<string>)[]): readonly string[] {
    return items.map((item) => (typeof item === "string" ? item : item.name));
}

/**
 * Builds a TreeSchema with the type information also captured in the
 * typescript type to allow for deriving schema aware APIs.
 */
export function typedTreeSchemaFromInfo<T extends TreeSchemaTypeInfo>(t: T): LabeledTreeSchema<T> {
    return namedTreeSchema(t) as LabeledTreeSchema<T>;
}

/**
 * Builds a FieldSchema with the type information also captured in the
 * typescript type to allow for deriving schema aware APIs.
 */
export function typedFieldSchemaFromInfo<T extends FieldSchemaTypeInfo>(
    t: T,
): LabeledFieldSchema<T> {
    return fieldSchema(t.kind, [...Object.keys(t.types as object)] as TreeSchemaIdentifier[]);
}

/**
 * Returns the `TreeSchemaTypeInfo` associated with `T`.
 */
export type TypeInfo<T extends LabeledTreeSchema<any>> = T extends LabeledTreeSchema<infer R>
    ? R
    : InferError;

/**
 * Version of `FieldInfo` with strong input type requirements for use in generic code.
 */
export type FieldInfoGeneric<T extends LabeledFieldSchema<FieldSchemaTypeInfo>> =
    T extends LabeledFieldSchema<infer R> ? R : never;

/**
 * Returns the `FieldSchemaTypeInfo` associated with `T`.
 */
export type FieldInfo<T extends LabeledFieldSchema<any>> = T extends LabeledFieldSchema<infer R>
    ? R
    : InferError;

/**
 * Schema for a field which must always be empty.
 */
export const emptyField = typedFieldSchema(forbidden, []);

/**
 * Placeholder used for errors inferring types.
 * Used instead of "never" since "never" can propagate in hard to track ways through type meta programming.
 */
export type InferError = "InferError";
