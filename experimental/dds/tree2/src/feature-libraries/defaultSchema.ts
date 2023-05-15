/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fieldSchema, emptyMap, emptySet, ValueSchema, TreeStoredSchema } from "../core";
import { value, forbidden, fieldKinds } from "./defaultFieldKinds";
import { FullSchemaPolicy } from "./modular-schema";

/**
 * FieldStoredSchema which is impossible for any data to be in schema with.
 */
export const neverField = fieldSchema(value, []);

/**
 * FieldStoredSchema which is impossible to put anything in.
 * @alpha
 */

export const emptyField = fieldSchema(forbidden, []);

/**
 * TreeStoredSchema which is impossible for any data to be in schema with.
 * @alpha
 */
export const neverTree: TreeStoredSchema = {
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
 * @alpha
 */
export const defaultSchemaPolicy: FullSchemaPolicy = {
	fieldKinds,
	defaultTreeSchema: neverTree,
	defaultGlobalFieldSchema: emptyField,
};
