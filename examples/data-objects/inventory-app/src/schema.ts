/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { AllowedUpdateType, FieldKinds, SchemaAware, SchemaBuilder, ValueSchema } from "@fluid-experimental/tree2";

const builder = new SchemaBuilder("inventory app");
const float64 = builder.leaf("number", ValueSchema.Number);
const string = builder.leaf("string", ValueSchema.String);

const part = builder.struct("Contoso:Part-1.0.0", {
	name: SchemaBuilder.field(FieldKinds.value, string),
	quantity: SchemaBuilder.field(FieldKinds.value, float64),
});

const inventory = builder.struct("Contoso:Inventory-1.0.0", {
	parts: SchemaBuilder.field(FieldKinds.sequence, part),
});

const rootField = SchemaBuilder.field(FieldKinds.value, inventory);
export type RootField = SchemaAware.TypedField<typeof rootField>;

export const schema = builder.intoDocumentSchema(rootField);

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
