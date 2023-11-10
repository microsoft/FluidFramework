/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	AllowedUpdateType,
	buildTreeConfiguration,
	ProxyNode,
	SchemaBuilder,
} from "@fluid-experimental/tree2";

const builder = new SchemaBuilder({ scope: "com.contoso.app.inventory" });

export type Part = ProxyNode<typeof Part>;
export const Part = builder.object("Part", {
	name: builder.string,
	quantity: builder.number,
});

export type Inventory = ProxyNode<typeof Inventory>;
export const Inventory = builder.object("Inventory", {
	parts: builder.list(Part),
});

export const treeConfiguration = buildTreeConfiguration({
	schema: builder.intoSchema(Inventory),
	allowedSchemaModifications: AllowedUpdateType.None,
	initialTree: {
		parts: {
			// TODO: FieldNodes should not require wrapper object
			"": [
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
	},
});
