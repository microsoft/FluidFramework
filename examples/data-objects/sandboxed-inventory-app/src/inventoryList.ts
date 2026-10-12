/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { defineTreeDataStore } from "@fluidframework/tree/alpha";

import { Inventory, treeConfiguration } from "./schema.js";

export const InventoryDataStore = defineTreeDataStore({
	type: "sandboxed-inventory",
	config: treeConfiguration,
	initializer: () =>
		new Inventory({
			parts: [
				{ name: "nut", quantity: 0 },
				{ name: "bolt", quantity: 0 },
			],
		}),
});
