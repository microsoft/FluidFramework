/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { SchemaFactory, TreeConfiguration } from "@fluidframework/tree";
import type { ContainerSchema } from "@fluidframework/fluid-static";
import { treeDataObject } from "../reactSharedTreeView.js";

describe("useTree()", () => {
	it("works", () => {
		const builder = new SchemaFactory("tree-react-api");

		class Inventory extends builder.object("Contoso:InventoryItem-1.0.0", {
			nuts: builder.number,
			bolts: builder.number,
		}) {}

		// TODO: There is no service implementation agnostic client abstraction that can be referred to here (ex: shared by AzureClient and OdspClient).
		// This makes documenting compatibility with that implicit common API difficult.
		// It also makes writing service agnostic code at that abstraction level harder.
		// This should be fixed.
		//
		// TODO:
		// Writing an app at this abstraction level currently requires a lot of boilerplate which also requires extra dependencies.
		// Since `@fluid-example/example-utils` doesn't provide that boilerplate and neither do the public packages, there isn't a concise way to actually use this container in this example.
		// This should be fixed.
		//
		// TODO:
		// The commonly used boilerplate for setting up a ContainerSchema based application configures the dev-tools, which would be great to include in this example,
		// but can't be included due to dependency layering issues.
		//
		// TODO: THis test setup fails to import files from src, and also errors on unused values, so this can't be enabled.
		const containerSchema = {
			initialObjects: {
				// TODO: it seems odd that DataObjects in container schema need both a key under initialObjects where they are,
				// as well as a key under the root data object, and SharedObjects only need one key.
				tree: treeDataObject(
					"tree",
					new TreeConfiguration(Inventory, () => ({ nuts: 5, bolts: 6 })),
				),
			},
		} satisfies ContainerSchema;
	});
});
