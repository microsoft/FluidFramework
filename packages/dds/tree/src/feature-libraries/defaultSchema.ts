/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { fieldSchema, emptyMap, emptySet, ValueSchema, TreeSchema } from "../schema-stored";
import { value, forbidden, optional, sequence, counter } from "./defaultFieldKinds";
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

export const defaultSchemaPolicy: FullSchemaPolicy = {
	fieldKinds: new Map([value, optional, sequence, forbidden, counter].map((s) => [s.identifier, s])),
	defaultTreeSchema: neverTree,
	defaultGlobalFieldSchema: emptyField,
};
