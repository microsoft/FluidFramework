/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Invariant } from "../util";
import { fieldSchema, treeSchema, TreeSchemaBuilder } from "./Builders";
import {
    FieldSchema,
    LocalFieldKey,
    FieldKind,
    TreeSchema,
    ValueSchema,
    TreeSchemaIdentifier,
} from "./Schema";

/**
 * APIs for building typescript types and schema together.
 * This is an example schema language which can support schema aware APIs in typescript without code gen.
 */

/**
 * Type implemented by schema to allow compile time schema access via type checking.
 */
interface TreeSchemaTypeInfo extends TreeSchemaBuilder {
    readonly local: { [key: string]: LabeledFieldSchema<any>; };
    readonly global: { [key: string]: unknown; };
    readonly extraLocalFields: LabeledFieldSchema<any>;
    readonly extraGlobalFields: boolean;
    readonly value: ValueSchema;
}

interface FieldSchemaTypeInfo {
    types: { [key: string]: unknown; };
    kind: FieldKind;
}

/**
 * Builds a TreeSchema with the type information also captured in the
 * typescript type to allow for deriving schema aware APIs.
 */
export function typedTreeSchema<T extends TreeSchemaTypeInfo>(t: T): LabeledTreeSchema<T> {
    return treeSchema(t) as LabeledTreeSchema<T>;
}

/**
 * Builds a FieldSchema with the type information also captured in the
 * typescript type to allow for deriving schema aware APIs.
 */
export function typedFieldSchema<T extends FieldSchemaTypeInfo>(t: T): LabeledFieldSchema<T> {
    return fieldSchema(t.kind, [...Object.keys(t.types)] as TreeSchemaIdentifier[]);
}

export type TypeInfo<T extends LabeledTreeSchema<any>> = T extends LabeledTreeSchema<
    infer R
>
    ? R
    : unknown;

export type FieldInfo<T extends LabeledFieldSchema<any>> =
    T extends LabeledFieldSchema<infer R> ? R : unknown;

export interface LabeledTreeSchema<T extends TreeSchemaTypeInfo>
    extends TreeSchema {
    readonly typeCheck?: Invariant<T>;

    // Allow reading localFields through the normal map, but without losing type information.
    readonly localFields: ObjectToMap<T["local"], LocalFieldKey>;
}

export interface LabeledFieldSchema<T extends FieldSchemaTypeInfo>
    extends FieldSchema {
    readonly typeCheck?: Invariant<T>;
}

type ObjectToMap<T, K extends number | string> = ReadonlyMap<K, FieldSchema> & {
    get<X extends keyof T>(key: X): T[X];
};
