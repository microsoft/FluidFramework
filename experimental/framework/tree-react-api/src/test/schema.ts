/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { FieldKinds, SchemaBuilder, TypedField, leaf } from "@fluid-experimental/tree2";

const builder = new SchemaBuilder({ scope: "tree-react-api", libraries: [leaf.library] });

export const inventory = builder.struct("Contoso:Inventory-1.0.0", {
	nuts: SchemaBuilder.field(FieldKinds.required, leaf.number),
	bolts: SchemaBuilder.field(FieldKinds.required, leaf.number),
});

export const inventoryField = SchemaBuilder.field(FieldKinds.required, inventory);

export const schema = builder.toDocumentSchema(inventoryField);

export type Inventory = TypedField<typeof schema.rootFieldSchema>;
