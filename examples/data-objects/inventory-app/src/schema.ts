/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ProxyNode, SchemaBuilder } from "@fluid-experimental/tree2";

const builder = new SchemaBuilder({
	scope: "com.contoso.app.inventory",
});

export const part = builder.object("Part", {
	name: builder.string,
	quantity: builder.number,
});

export const inventory = builder.object("Inventory", {
	parts: builder.list(part),
});

export const schema = builder.intoSchema(inventory);

export type Inventory = ProxyNode<typeof inventory>;
