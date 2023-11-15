/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeField, SchemaBuilder, leaf } from "@fluid-experimental/tree2";

const builder = new SchemaBuilder({ scope: "tree-react-api" });

export const inventory = builder.object("Contoso:Inventory-1.0.0", {
	nuts: leaf.number,
	bolts: leaf.number,
});

export const schema = builder.intoSchema(inventory);

export type Inventory = TreeField<typeof schema.rootFieldSchema>;
