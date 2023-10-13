/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaBuilder, TypedField, TypedNode, leaf } from "@fluid-experimental/tree2";

const builder = new SchemaBuilder({ scope: "inventory app" });

export const part = builder.struct("Contoso:Part-1.0.0", {
	name: leaf.string,
	quantity: leaf.number,
});

export const inventory = builder.struct("Contoso:Inventory-1.0.0", {
	parts: builder.sequence(part),
});

export const schema = builder.toDocumentSchema(inventory);

export type InventoryField = TypedField<typeof schema.rootFieldSchema>;
export type Inventory = TypedNode<typeof inventory>;
