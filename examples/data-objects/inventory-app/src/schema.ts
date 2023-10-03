/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	AllowedUpdateType,
	leaf,
	FieldKinds,
	SchemaAware,
	SchemaBuilder,
} from "@fluid-experimental/tree2";

// By importing the leaf library we don't have to define our own string and number types.
const builder = new SchemaBuilder("inventory app", undefined, leaf.library);

const part = builder.struct("Contoso:Part-1.0.0", {
	name: SchemaBuilder.field(FieldKinds.value, leaf.string),
	quantity: SchemaBuilder.field(FieldKinds.value, leaf.number),
});

// REV: Building this up as a series of builder invocations makes it hard to read the schema.
// Would be nice if instead we could define some single big Serializable or similar that laid the
// schema out and then pass that in.
const inventory = builder.struct("Contoso:Inventory-1.0.0", {
	parts: SchemaBuilder.field(FieldKinds.sequence, part),
});

// REV: The rootField feels extra to me.  Is there a way to omit it?  Something like
// builder.intoDocumentSchema(inventory)
const rootField = SchemaBuilder.field(FieldKinds.value, inventory);
const schema = builder.intoDocumentSchema(rootField);

export type Inventory = SchemaAware.TypedNode<typeof inventory>;

export const schemaPolicy = {
	schema,
	initialTree: {
		parts: [
			{
				name: "nut",
				quantity: 0,
			},
			{
				name: "bolt",
				quantity: 0,
			},
		],
	},
	allowedSchemaModifications: AllowedUpdateType.None,
};
