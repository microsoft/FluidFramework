/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import React from "react";

import { InventoryList, InventoryListFactory } from "./inventoryList";
export { InventoryList, InventoryListFactory } from "./inventoryList";

import { MainView } from "./view/inventoryList";

export const fluidExport = new ContainerViewRuntimeFactory(
	InventoryListFactory,
	(model: InventoryList) => React.createElement(MainView, { tree: model.tree }),
);
