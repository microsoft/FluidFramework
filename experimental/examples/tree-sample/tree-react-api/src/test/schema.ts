/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	FieldKinds,
	rootFieldKey,
	SchemaAware,
	TypedSchema,
	ValueSchema,
} from "@fluid-internal/tree";

export const numberSchema = TypedSchema.tree("number", { value: ValueSchema.Number });

export const inventorySchema = TypedSchema.tree("Contoso:Inventory-1.0.0", {
	local: {
		nuts: TypedSchema.field(FieldKinds.value, numberSchema),
		bolts: TypedSchema.field(FieldKinds.value, numberSchema),
	},
});

export const rootField = TypedSchema.field(FieldKinds.value, inventorySchema);

export const schema = SchemaAware.typedSchemaData(
	[[rootFieldKey, rootField]],
	numberSchema,
	inventorySchema,
);

export type Inventory = SchemaAware.NodeDataFor<
	typeof schema,
	SchemaAware.ApiMode.Normalized,
	typeof inventorySchema
>;
