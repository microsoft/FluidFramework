/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { Invariant, requireTrue } from "../TypeCheck";
import { fieldSchema, treeSchema, TreeSchemaBuilder } from "./Builders";
import {
    FieldSchema,
    LocalFieldKey,
    FieldKind,
    TreeSchema,
    ValueSchema,TreeSchemaIdentifier
} from "./Schema";

/**
 * APIs for building typescript types and schema together.
 */

/**
 * Type implemented by schema to allow compile time schema access via type checking.
 */
interface TreeSchemaTypeInfo extends TreeSchemaBuilder {
    readonly local: { [key: string]: LabeledFieldSchema<any> };
    readonly global: { [key: string]: unknown };
    readonly extraLocalFields: LabeledFieldSchema<any>;
    readonly extraGlobalFields: boolean;
    readonly value: ValueSchema;
}

interface FieldSchemaTypeInfo {
    types: { [key: string]: unknown };
    kind: FieldKind;
}

function build<T extends TreeSchemaTypeInfo>(t: T): LabeledTreeSchema<T> {
    return treeSchema(t) as LabeledTreeSchema<T>;
}

function field<T extends FieldSchemaTypeInfo>(t: T): LabeledFieldSchema<T> {
    return fieldSchema(t.kind, [...Object.keys(t.types)] as TreeSchemaIdentifier[])
}

const lk1 = "localKey1Name" as const;

export const lk2 = "localKey2Name" as const;

export const testTypeIdentifier = "testType" as const;

const testField = field({
    types: { testType: 0 as unknown },
    kind: FieldKind.Value,
});

export const testTreeSchema = build({
    local: { localKey1Name: testField },
    global: {},
    extraLocalFields: testField,
    extraGlobalFields: true as const,
    value: ValueSchema.Serializable as const,
});

type TestTreeSchema = TypeInfo<typeof testTreeSchema>;

export type _assert = requireTrue<TestTreeSchema["extraGlobalFields"]>;

type TypeInfo<T extends LabeledTreeSchema<any>> = T extends LabeledTreeSchema<
    infer R
>
    ? R
    : unknown;
type FieldInfo<T extends LabeledFieldSchema<any>> =
    T extends LabeledFieldSchema<infer R> ? R : unknown;

export interface LabeledTreeSchema<T extends TreeSchemaTypeInfo>
    extends TreeSchema {
    readonly typeCheck?: Invariant<T>;

    readonly localFields: ObjectToMap<T["local"], LocalFieldKey>;
}

export interface LabeledFieldSchema<T extends FieldSchemaTypeInfo>
    extends FieldSchema {
    readonly typeCheck?: Invariant<T>;
}

export type child = FieldInfo<TestTreeSchema["local"][typeof lk1]>;

// type child2 = FieldInfo<xx["local"][typeof lk2]>;

type ObjectToMap<T, K extends number | string> = ReadonlyMap<K, FieldSchema> & {
    get<X extends keyof T>(key: X): T[X];
};

export const xxxx = testTreeSchema.localFields.get(lk1);

// This is an error since this field does not exist:
// const xxx2 = testTreeSchema.localFields.get(lk2);
