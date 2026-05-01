/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { createAzureServiceClient } from "@fluidframework/azure-client/alpha";
import { toPropTreeNode } from "@fluidframework/react/alpha";
import {
	InsecureTinyliciousTokenProvider,
	createTinyliciousServiceClient,
} from "@fluidframework/tinylicious-driver/alpha";
import type { TreeView } from "fluid-framework";
import type { FluidContainerAttached } from "fluid-framework/alpha";
import { createElement } from "react";
// eslint-disable-next-line import-x/no-internal-modules
import { createRoot } from "react-dom/client";

import { inventoryDataStoreKind } from "./inventoryList.js";
import type { Inventory } from "./schema.js";
import { MainView } from "./view/index.js";

const serviceOptions = {
	minVersionForCollab: "2.100.0",
} as const;

const service =
	process.env.FLUID_CLIENT === "azure"
		? createAzureServiceClient({
				...serviceOptions,
				connection: {
					type: "local",
					endpoint: "http://localhost:7071",
					tokenProvider: new InsecureTinyliciousTokenProvider(),
				},
			})
		: createTinyliciousServiceClient(serviceOptions);

const id = location.hash.slice(1);
let attached: FluidContainerAttached<TreeView<typeof Inventory>>;

if (id.length > 0) {
	attached = await service.loadContainer(id, inventoryDataStoreKind);
} else {
	const container = await service.createContainer(inventoryDataStoreKind);
	attached = await container.attach();
	location.hash = attached.id;
}

const root: Inventory = attached.data.root;

const rootEl = document.querySelector("#content");
if (rootEl === null) {
	throw new Error("No #content element found");
}
createRoot(rootEl).render(createElement(MainView, { root: toPropTreeNode(root) }));
