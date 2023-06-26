/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKinds, SchemaAware, SchemaBuilder, ValueSchema } from "@fluid-experimental/tree2";

const builder = new SchemaBuilder("tree-react-api");
export const float64 = builder.primitive("number", ValueSchema.Number);

export const inventory = builder.object("Contoso:Inventory-1.0.0", {
	local: {
		nuts: SchemaBuilder.field(FieldKinds.value, float64),
		bolts: SchemaBuilder.field(FieldKinds.value, float64),
	},
});

export const rootField = SchemaBuilder.field(FieldKinds.value, inventory);

export const schema = builder.intoDocumentSchema(rootField);

export type Inventory = SchemaAware.TypedNode<typeof inventory>;
