/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import type { IReactTreeDataObject } from "@fluidframework/react/alpha";
import { createElement } from "react";

import { InventoryListFactory } from "./inventoryList.js";
import type { Inventory } from "./schema.js";
import { MainView } from "./view/index.js";

export const fluidExport = new ContainerViewRuntimeFactory(
	InventoryListFactory,
	(tree: IReactTreeDataObject<typeof Inventory>) =>
		createElement(tree.TreeViewComponent, { viewComponent: MainView }),
);
