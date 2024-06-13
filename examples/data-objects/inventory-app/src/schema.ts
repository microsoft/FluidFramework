/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import/no-deprecated
import { SchemaFactory, TreeConfiguration } from "@fluidframework/tree";

const builder = new SchemaFactory("com.contoso.app.inventory");

export class Part extends builder.object("Part", {
	name: builder.string,
	quantity: builder.number,
}) {}
export class Inventory extends builder.object("Inventory", {
	parts: builder.array(Part),
}) {}

// eslint-disable-next-line import/no-deprecated
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
