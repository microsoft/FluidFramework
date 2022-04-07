/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldSchema, Multiplicity, TreeSchema, ValueSchema } from "./Schema";

/**
 * Some special schema for edge cases that are used by the schema system itself.
 * None of these should be used to store actual data, but are instead part of the schema type system,
 * encoding things like top and bottom types, and default schema.
 */

/**
 * Empty readonly set.
 */
export const emptySet: ReadonlySet<never> = new Set();

/**
 * Empty readonly map.
 */
export const emptyMap: ReadonlyMap<any, never> = new Map<any, never>();

/**
 * Default field which only permits emptiness.
 */
export const emptyField: FieldSchema = {
    multiplicity: Multiplicity.Forbidden,
    types: emptySet,
};

/**
 * FieldSchema which is impossible for any data to be in schema with.
 */
export const neverField: FieldSchema = {
    multiplicity: Multiplicity.Value,
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
    multiplicity: Multiplicity.Sequence,
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
