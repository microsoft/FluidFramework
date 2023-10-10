/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaBuilder, TypedField, TypedNode, leaf } from "@fluid-experimental/tree2";

const builder = new SchemaBuilder({ scope: "inventory app", libraries: [leaf.library] });

export const part = builder.struct("Contoso:Part-1.0.0", {
	name: SchemaBuilder.fieldRequired(leaf.string),
	quantity: SchemaBuilder.fieldRequired(leaf.number),
});

export const inventory = builder.struct("Contoso:Inventory-1.0.0", {
	parts: SchemaBuilder.fieldSequence(part),
});

export const inventoryField = SchemaBuilder.fieldRequired(inventory);
export type InventoryField = TypedField<typeof inventoryField>;

export const schema = builder.toDocumentSchema(inventoryField);

export type Inventory = TypedNode<typeof inventory>;
