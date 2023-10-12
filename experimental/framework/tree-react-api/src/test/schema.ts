/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaBuilder, TypedField, leaf } from "@fluid-experimental/tree2";

const builder = new SchemaBuilder({ scope: "tree-react-api", libraries: [leaf.library] });

export const inventory = builder.struct("Contoso:Inventory-1.0.0", {
	nuts: leaf.number,
	bolts: leaf.number,
});

export const schema = builder.toDocumentSchema(inventory);

export type Inventory = TypedField<typeof schema.rootFieldSchema>;
