/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */
// Lint rule can be disabled once eslint config is upgraded to 5.3.0+
// eslint-disable-next-line import/no-internal-modules
import { DataObjectFactory } from "@fluidframework/aqueduct/internal";

import { ContainerSchema } from "fluid-framework";

import { TreeDataObject, factory, treeDataObject } from "./reactSharedTreeView.js";
import { type Inventory, treeConfiguration } from "./schema.js";

/**
 * For use with high level service-client container API's like AzureClient and OdspClient.
 * @privateRemarks
 * TODO: There is no service implementation agnostic client abstraction that can be referred to here (ex: shared by AzureClient and OdspClient).
 * This makes documenting compatibility with that implicit common API difficult.
 * It also makes writing service agnostic code at that abstraction level harder.
 * This should be fixed.
 *
 * TODO:
 * Writing an app at this abstraction level currently requires a lot of boilerplate which also requires extra dependencies.
 * Since `@fluid-example/example-utils` doesn't provide that boilerplate and neither do the public packages, there isn't a concise way to actually use this container in this example.
 * This should be fixed.
 *
 * TODO:
 * The commonly used boilerplate for setting up a ContainerSchema based application configures the dev-tools, which would be great to include in this example,
 * but can't be included due to dependency layering issues.
 */
export const containerSchema = {
	initialObjects: {
		// TODO: it seems odd that DataObjects in container schema need both a key under initialObjects where they are,
		// as well as a key under the root data object, and SharedObjects only need one key.
		tree: treeDataObject("tree", treeConfiguration),
	},
} satisfies ContainerSchema;

// For use with lower level APIs, like ContainerViewRuntimeFactory from "@fluid-example/example-utils".
export class InventoryList extends TreeDataObject<typeof Inventory> {
	public readonly key = "tree";
	public readonly config = treeConfiguration;
}

export const InventoryListFactory = new DataObjectFactory(
	"@fluid-experimental/inventory-list",
	InventoryList,
	[factory],
	{},
);
