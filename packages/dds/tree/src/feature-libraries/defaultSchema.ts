/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fieldSchema, emptyMap, emptySet, ValueSchema, TreeSchema } from "../schema-stored";
import { value, forbidden, fieldKinds } from "./defaultFieldKinds";
import { FullSchemaPolicy } from "./modular-schema";

/**
 * FieldSchema which is impossible for any data to be in schema with.
 */
export const neverField = fieldSchema(value, []);

/**
 * FieldSchema which is impossible to put anything in.
 */

export const emptyField = fieldSchema(forbidden, []);

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
 * FullSchemaPolicy the default field kinds, empty default fields and neverTree for the default tree schema.
 *
 * This requires new node types to have explicit stored schema to exist in documents,
 * and allows adding new global fields along with their schema at any point.
 */
export const defaultSchemaPolicy: FullSchemaPolicy = {
    fieldKinds,
    defaultTreeSchema: neverTree,
    defaultGlobalFieldSchema: emptyField,
};
