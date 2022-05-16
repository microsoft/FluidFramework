/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
/* eslint-disable import/no-internal-modules */

// TODO: what is the pattern for testing packages which have folders inside src?
import { FieldKind, ValueSchema } from "../schema/Schema";
import { typedTreeSchema, typedFieldSchema, FieldInfo, TypeInfo } from "../schema/typedSchema";
import { requireTrue } from "../typeCheck";

// These tests currently just cover the type checking, so its all compile time.

const lk1 = "localKey1Name" as const;

export const lk2 = "localKey2Name" as const;

export const testTypeIdentifier = "testType" as const;

const testField = typedFieldSchema({
    types: { testType: 0 as unknown },
    kind: FieldKind.Value,
});

export const testTreeSchema = typedTreeSchema({
    local: { localKey1Name: testField },
    global: {},
    extraLocalFields: testField,
    extraGlobalFields: true as const,
    value: ValueSchema.Serializable as const,
});

type TestTreeSchema = TypeInfo<typeof testTreeSchema>;

export type _assert = requireTrue<TestTreeSchema["extraGlobalFields"]>;

export type child = FieldInfo<TestTreeSchema["local"][typeof lk1]>;

// type child2 = FieldInfo<xx["local"][typeof lk2]>;

export const xxxx = testTreeSchema.localFields.get(lk1);

// This is an error since this field does not exist:
// const xxx2 = testTreeSchema.localFields.get(lk2);
