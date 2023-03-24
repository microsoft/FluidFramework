/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKinds, fieldSchema, rootFieldKey, SchemaData } from "@fluid-internal/tree";

import { numberSchema } from "./primitivesSchema";
import { inventorySchema } from "./inventorySchema";

export const appSchema = fieldSchema(FieldKinds.value, [inventorySchema.name]);

export const appSchemaData: SchemaData = {
	treeSchema: new Map([
		[numberSchema.name, numberSchema],
		[inventorySchema.name, inventorySchema],
	]),
	globalFieldSchema: new Map([[rootFieldKey, appSchema]]),
};
