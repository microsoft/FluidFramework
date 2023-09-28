/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import React from "react";

import { InventoryListTrio, InventoryListTrioFactory } from "./inventoryListTrio";
import { MainView } from "./view";

export const fluidExport = new ContainerViewRuntimeFactory(
	InventoryListTrioFactory,
	(model: InventoryListTrio) =>
		React.createElement(MainView, {
			legacySharedTreeInventoryList: model.legacySharedTreeInventoryList,
			sharedTreeInventoryList: model.sharedTreeInventoryList,
			sharedTreeForHook: model.sharedTreeForHook,
		}),
);
