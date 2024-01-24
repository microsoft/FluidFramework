/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import React from "react";

import { InventoryList, InventoryListFactory } from "./inventoryList.js";
import { Inventory, treeConfiguration } from "./schema.js";
import { MainView } from "./view/inventoryList.js";
import { TreeViewComponent } from "./reactSharedTreeView.js";
export { InventoryList, InventoryListFactory } from "./inventoryList.js";

/**
 * @internal
 */
export const fluidExport = new ContainerViewRuntimeFactory(
	InventoryListFactory,
	(model: InventoryList) =>
		React.createElement(TreeViewComponent<typeof Inventory>, {
			tree: model.tree,
			config: treeConfiguration,
			viewComponent: MainView,
		}),
);
