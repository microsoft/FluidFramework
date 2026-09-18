/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

// eslint-disable-next-line import-x/no-internal-modules
import { treeDataObjectInternal } from "@fluidframework/react/internal";

import { Inventory, treeConfiguration } from "./schema.js";

export const InventoryListFactory = treeDataObjectInternal(
	treeConfiguration,
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
).factory;
