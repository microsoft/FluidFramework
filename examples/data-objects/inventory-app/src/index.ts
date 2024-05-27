/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import React from "react";

import type { IReactTreeDataObject } from "@fluid-experimental/tree-react-api";
import { InventoryListFactory } from "./inventoryList.js";
import { MainView } from "./view/inventoryList.js";
import type { Inventory } from "./schema.js";

export const fluidExport = new ContainerViewRuntimeFactory(
	InventoryListFactory,
	(tree: IReactTreeDataObject<typeof Inventory>) =>
		React.createElement(tree.TreeViewComponent, { viewComponent: MainView }),
);
