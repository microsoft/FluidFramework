/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { defineTreeDataStore } from "fluid-framework/alpha";

import { Inventory, treeConfiguration } from "./schema.js";

export const inventoryDataStoreKind = defineTreeDataStore({
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
