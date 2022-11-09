/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
    typedTreeSchema,
    typedFieldSchema,
    FieldInfo,
    TypeInfo,
    // Allow importing from this specific file which is being tested:
    /* eslint-disable-next-line import/no-internal-modules */
} from "../../../feature-libraries/modular-schema/typedSchema";

import { ValueSchema } from "../../../schema-stored";
import { brand, requireTrue } from "../../../util";
import { FieldKinds } from "../../../feature-libraries";

// These tests currently just cover the type checking, so its all compile time.

const lk1 = "localKey1Name";

export const lk2 = "localKey2Name";

export const testTypeIdentifier = "testType";

const testField = typedFieldSchema({
    types: { testType: 0 as unknown },
    kind: FieldKinds.value,
});

export const testTreeSchema = typedTreeSchema({
    name: brand("testTreeSchema"),
    local: { localKey1Name: testField },
    global: {},
    extraLocalFields: testField,
    extraGlobalFields: true,
    value: ValueSchema.Serializable,
});

type TestTreeSchema = TypeInfo<typeof testTreeSchema>;

export type _assert = requireTrue<TestTreeSchema["extraGlobalFields"]>;

export type child = FieldInfo<TestTreeSchema["local"][typeof lk1]>;

// This is an error since this field does not exist:
// type invalidChildType = FieldInfo<TestTreeSchema["local"][typeof lk2]>;

export const xxxx = testTreeSchema.localFields.get(lk1);

// This is an error since this field does not exist:
// const invalidChildSchema = testTreeSchema.localFields.get(lk2);
