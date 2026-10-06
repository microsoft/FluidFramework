/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	createOrLoadExampleContainer,
	getExampleServiceClient,
} from "@fluid-example/example-utils";
import type { TreeView } from "@fluidframework/tree";

import { InventoryDataStore } from "./inventoryList.js";
import type { Inventory } from "./schema.js";

/**
 * The application-owned container and its inventory view, retained across Guest sessions.
 */
export type HostContainer = Awaited<
	ReturnType<typeof createOrLoadExampleContainer<TreeView<typeof Inventory>>>
>;

/**
 * Creates or loads the Host container selected by the page URL.
 * @returns The container, including its application-owned tree view.
 */
export async function loadHost(): Promise<HostContainer> {
	const service = getExampleServiceClient({ oldestSupportedClient: "3.4.0" });
	return createOrLoadExampleContainer(service, InventoryDataStore);
}
