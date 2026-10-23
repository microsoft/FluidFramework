/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	ExampleErrorView,
	ExampleLoadingView,
	loadExampleDataStore,
	renderRoot,
} from "@fluid-example/example-utils";
import { toPropTreeNode } from "@fluidframework/react/alpha";
import { createElement } from "react";

import { InventoryDataStore } from "./inventoryList.js";
import type { Inventory } from "./schema.js";
import { MainView } from "./view/index.js";

renderRoot(createElement(ExampleLoadingView));
try {
	const view = await loadExampleDataStore(InventoryDataStore);
	const root: Inventory = view.root;
	renderRoot(createElement(MainView, { root: toPropTreeNode(root) }));
} catch (error) {
	console.error("Failed to start:", error);
	renderRoot(createElement(ExampleErrorView, { error }));
}
