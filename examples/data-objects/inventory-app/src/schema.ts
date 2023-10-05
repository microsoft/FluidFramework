/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKinds, SchemaBuilder, TypedField, TypedNode, leaf } from "@fluid-experimental/tree2";

const builder = new SchemaBuilder("inventory app", {}, leaf.library);

export const part = builder.struct("Contoso:Part-1.0.0", {
	name: SchemaBuilder.field(FieldKinds.required, leaf.string),
	quantity: SchemaBuilder.field(FieldKinds.required, leaf.number),
});

export const inventory = builder.struct("Contoso:Inventory-1.0.0", {
	parts: SchemaBuilder.field(FieldKinds.sequence, part),
});

export const inventoryField = SchemaBuilder.field(FieldKinds.required, inventory);
export type InventoryField = TypedField<typeof inventoryField>;

export const schema = builder.intoDocumentSchema(inventoryField);

export type Inventory = TypedNode<typeof inventory>;
