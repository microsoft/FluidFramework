/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKinds, SchemaAware, SchemaBuilder, ValueSchema } from "@fluid-experimental/tree2";

const builder = new SchemaBuilder("inventory app");
export const float64 = builder.primitive("number", ValueSchema.Number);
export const string = builder.primitive("string", ValueSchema.String);

export const part = builder.struct("Contoso:Part-1.0.0", {
	name: SchemaBuilder.field(FieldKinds.value, string),
	quantity: SchemaBuilder.field(FieldKinds.value, float64),
});

export const inventory = builder.struct("Contoso:Inventory-1.0.0", {
	parts: SchemaBuilder.field(FieldKinds.sequence, part),
});

export const rootField = SchemaBuilder.field(FieldKinds.value, inventory);
export type RootField = SchemaAware.TypedField<typeof rootField>;

export const schema = builder.intoDocumentSchema(rootField);

export type Inventory = SchemaAware.TypedNode<typeof inventory>;
