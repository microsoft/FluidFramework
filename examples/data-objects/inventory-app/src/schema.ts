/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { TreeConfiguration, SchemaFactory } from "@fluid-experimental/tree2";

const builder = new SchemaFactory("com.contoso.app.inventory");

export class Part extends builder.object("Part", {
	name: builder.string,
	quantity: builder.number,
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
				},
				{
					name: "bolt",
					quantity: 0,
				},
			],
		}),
);
