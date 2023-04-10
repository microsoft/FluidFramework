/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKinds, rootFieldKey, SchemaAware, TypedSchema } from "@fluid-internal/tree";

import { numberSchema } from "./primitivesSchema";
import { inventorySchema } from "./inventorySchema";

export const appSchema = TypedSchema.field(FieldKinds.value, inventorySchema);

export const appSchemaData = SchemaAware.typedSchemaData(
	[[rootFieldKey, appSchema]],
	numberSchema,
	inventorySchema,
);

export type Inventory = SchemaAware.NodeDataFor<
	typeof appSchemaData,
	SchemaAware.ApiMode.Editable,
	typeof inventorySchema
>;
