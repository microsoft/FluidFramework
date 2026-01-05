/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import type { IReactTreeDataObject } from "@fluidframework/react/alpha";
import * as React from "react";

import { InventoryListFactory } from "./inventoryList.js";
import type { Inventory } from "./schema.js";
// eslint-disable-next-line import-x/no-internal-modules
import { MainView } from "./view/inventoryList.js";

export const fluidExport = new ContainerViewRuntimeFactory(
	InventoryListFactory,
	(tree: IReactTreeDataObject<typeof Inventory>) =>
		React.createElement(tree.TreeViewComponent, { viewComponent: MainView }),
);
