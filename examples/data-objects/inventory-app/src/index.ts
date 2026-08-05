/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { toPropTreeNode } from "@fluidframework/react/alpha";
import { loadExampleDataStore, renderRoot } from "@fluid-example/example-utils";
import { createElement } from "react";

import { inventoryDataStoreKind } from "./inventoryList.js";
import type { Inventory } from "./schema.js";
import { MainView } from "./view/index.js";

const view = await loadExampleDataStore(inventoryDataStoreKind);
const root: Inventory = view.root;
renderRoot(createElement(MainView, { root: toPropTreeNode(root) }));
