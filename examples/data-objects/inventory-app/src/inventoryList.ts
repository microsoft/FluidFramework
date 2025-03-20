/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { treeDataObjectInternal } from "@fluid-experimental/tree-react-api/internal";

import { Inventory, treeConfiguration } from "./schema.js";

export const InventoryListFactory = treeDataObjectInternal(
	"tree",
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
