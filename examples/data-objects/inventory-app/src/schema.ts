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
} from "@fluid-experimental/tree2";

export const float64 = TypedSchema.tree("number", { value: ValueSchema.Number });
export const string = TypedSchema.tree("string", { value: ValueSchema.String });

export const part = TypedSchema.tree("Contoso:Part-1.0.0", {
	local: {
		name: TypedSchema.field(FieldKinds.value, string),
		quantity: TypedSchema.field(FieldKinds.value, float64),
	},
});

export const inventory = TypedSchema.tree("Contoso:Inventory-1.0.0", {
	local: {
		parts: TypedSchema.field(FieldKinds.sequence, part),
	},
});

export const rootField = TypedSchema.field(FieldKinds.value, inventory);

export const schema = SchemaAware.typedSchemaData(
	[[rootFieldKey, rootField]],
	float64,
	string,
	part,
	inventory,
);

export type Inventory = SchemaAware.NodeDataFor<
	typeof schema,
	SchemaAware.ApiMode.Editable,
	typeof inventory
>;
