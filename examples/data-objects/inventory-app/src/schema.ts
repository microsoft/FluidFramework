/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ProxyNode, SchemaBuilder, leaf } from "@fluid-experimental/tree2";

const builder = new SchemaBuilder({
	scope: "com.contoso.app.inventory",
});

export const part = builder.struct("Part", {
	name: leaf.string,
	quantity: leaf.number,
});

export const partList = builder.fieldNode("List<Part>", builder.sequence(part));

export const inventory = builder.struct("Inventory", {
	parts: partList,
});

export const schema = builder.toDocumentSchema(inventory);

export type Inventory = ProxyNode<typeof inventory>;
