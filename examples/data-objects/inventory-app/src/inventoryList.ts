/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { treeDataStoreKind } from "fluid-framework/alpha";

import { Inventory, treeConfiguration } from "./schema.js";

export const inventoryDataStoreKind = treeDataStoreKind({
	type: "inventory-list",
	config: treeConfiguration,
	initializer: () =>
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
});
