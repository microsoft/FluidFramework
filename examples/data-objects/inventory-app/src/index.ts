/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import React from "react";

import { InventoryList, InventoryListFactory } from "./inventoryList.js";
import { MainView } from "./view/inventoryList.js";
export { InventoryList, InventoryListFactory } from "./inventoryList.js";

/**
 * @internal
 */
export const fluidExport = new ContainerViewRuntimeFactory(
	InventoryListFactory,
	(tree: InventoryList) =>
		React.createElement(tree.TreeViewComponent, { viewComponent: MainView }),
);
