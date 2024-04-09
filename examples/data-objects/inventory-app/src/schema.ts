/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory, TreeConfiguration } from "@fluidframework/tree";

const builder = new SchemaFactory("com.contoso.app.inventory");

export class Part extends builder.object("Part", {
	name: builder.string,
	quantity: builder.number,
	alias: builder.optional(builder.string),
}) {}
export class Inventory extends builder.object("Inventory", {
	parts: builder.array(Part),
}) {}

export const treeConfiguration = new TreeConfiguration(
	Inventory,
	() =>
		new Inventory({
			parts: [
				{
					name: "nut",
					quantity: 0,
					alias: undefined,
				},
				{
					name: "bolt",
					quantity: 0,
					alias: undefined,
				},
			],
		}),
);
