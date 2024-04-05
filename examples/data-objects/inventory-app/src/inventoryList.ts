/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// Lint rule can be disabled once eslint config is upgraded to 5.3.0+
// eslint-disable-next-line import/no-internal-modules
import { DataObjectFactory } from "@fluidframework/aqueduct/internal";

import { TreeDataObject, factory } from "./reactSharedTreeView.js";
import { type Inventory, treeConfiguration } from "./schema.js";

// For use with lower level APIs, like ContainerViewRuntimeFactory from "@fluid-example/example-utils".
export class InventoryList extends TreeDataObject<typeof Inventory> {
	public readonly key = "tree";
	public readonly config = treeConfiguration;
}

export const InventoryListFactory = new DataObjectFactory(
	"@fluid-experimental/inventory-list",
	InventoryList,
	[factory],
	{},
);
