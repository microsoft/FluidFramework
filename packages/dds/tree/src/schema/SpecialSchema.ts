/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldSchema, FieldKind, TreeSchema, ValueSchema } from "./Schema";
import { emptySet, emptyMap } from "./Builders";

/**
 * Some special schema for edge cases that are used by the schema system itself.
 * None of these should be used to store actual data, but are instead part of the schema type system,
 * encoding things like top and bottom types, and default schema.
 */

/**
 * FieldSchema which is impossible for any data to be in schema with.
 */
export const neverField: FieldSchema = {
    kind: FieldKind.Value,
    types: emptySet,
};

/**
 * TreeSchema which is impossible for any data to be in schema with.
 */
export const neverTree: TreeSchema = {
    localFields: emptyMap,
    globalFields: emptySet,
    extraLocalFields: neverField,
    extraGlobalFields: false,
    value: ValueSchema.Nothing,
};

/**
 * FieldSchema permits anything.
 * Note that children inside the field still have to be in schema.
 */
export const anyField: FieldSchema = {
    kind: FieldKind.Sequence,
};

/**
 * TreeSchema that permits anything.
 * Note that children under the fields (and global fields) still have to be in schema.
 */
export const anyTree: TreeSchema = {
    localFields: emptyMap,
    globalFields: emptySet,
    extraLocalFields: anyField,
    extraGlobalFields: true,
    value: ValueSchema.Serializable,
};
