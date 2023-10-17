/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { leaf, SchemaBuilder, Typed } from "@fluid-experimental/tree2";

// By importing the leaf library we don't have to define our own string and number types.
const builder = new SchemaBuilder({ scope: "inventory app", libraries: [leaf.library] });

const inventoryItem = builder.struct("Contoso:InventoryItem-1.0.0", {
	// REV: I added an ID here because I didn't find a unique identifier on the node.
	// I'm not necessarily opposed to this, but I wonder if it's needed/duplicative.
	id: leaf.string,
	name: leaf.string,
	quantity: leaf.number,
});
export type InventoryItemNode = Typed<typeof inventoryItem>;

// REV: Building this up as a series of builder invocations makes it hard to read the schema.
// Would be nice if instead we could define some single big Serializable or similar that laid the
// schema out and then pass that in.
const inventory = builder.struct("Contoso:Inventory-1.0.0", {
	inventoryItems: builder.sequence(inventoryItem),
});
export type InventoryNode = Typed<typeof inventory>;

// REV: The rootField feels extra to me.  Is there a way to omit it?  Something like
// builder.intoDocumentSchema(inventory)
const inventoryField = SchemaBuilder.required(inventory);
export type InventoryField = Typed<typeof inventoryField>;

export const schema = builder.toDocumentSchema(inventoryField);
