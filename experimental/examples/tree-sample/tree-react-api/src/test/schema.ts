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

export const float64 = TypedSchema.tree("number", { value: ValueSchema.Number });

export const inventory = TypedSchema.tree("Contoso:Inventory-1.0.0", {
	local: {
		nuts: TypedSchema.field(FieldKinds.value, float64),
		bolts: TypedSchema.field(FieldKinds.value, float64),
	},
});

export const rootField = TypedSchema.field(FieldKinds.value, inventory);

export const schema = SchemaAware.typedSchemaData([[rootFieldKey, rootField]], float64, inventory);

export type Inventory = SchemaAware.NodeDataFor<
	typeof schema,
	SchemaAware.ApiMode.Editable,
	typeof inventory
>;
