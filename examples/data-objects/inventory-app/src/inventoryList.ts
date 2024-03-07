/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { DataObjectFactory } from "@fluidframework/aqueduct";
import { TreeDataObject, factory } from "./reactSharedTreeView.js";
import { treeConfiguration, type Inventory } from "./schema.js";

/**
 * @internal
 */
export class InventoryList extends TreeDataObject<typeof Inventory> {
	public readonly key = "tree";
	public readonly config = treeConfiguration;
}

/**
 * @internal
 */
export const InventoryListFactory = new DataObjectFactory(
	"@fluid-experimental/inventory-list",
	InventoryList,
	[factory],
	{},
);
