/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { ContainerViewRuntimeFactory } from "@fluid-example/example-utils";
import React from "react";

import { InventoryListTrio, InventoryListTrioFactory } from "./inventoryList";

import { MainView } from "./view";

export const fluidExport = new ContainerViewRuntimeFactory(
	InventoryListTrioFactory,
	(model: InventoryListTrio) =>
		React.createElement(MainView, {
			legacySharedTree: model.legacySharedTree,
			sharedTreeInventoryList: model.sharedTreeInventoryList,
			sharedTreeForHook: model.sharedTreeForHook,
		}),
);
