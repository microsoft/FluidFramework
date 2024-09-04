/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { ContainerSchema } from "@fluidframework/fluid-static";
import { TinyliciousClient } from "@fluidframework/tinylicious-client";
import { SchemaFactory, TreeViewConfiguration } from "@fluidframework/tree";

import { treeDataObject } from "../reactSharedTreeView.js";

describe("reactSharedTreeView", () => {
	it("treeDataObject", async () => {
		const builder = new SchemaFactory("tree-react-api");

		class Inventory extends builder.object("Contoso:InventoryItem-1.0.0", {
			nuts: builder.number,
			bolts: builder.number,
		}) {}

		const containerSchema = {
			initialObjects: {
				// TODO: it seems odd that DataObjects in container schema need both a key under initialObjects where they are,
				// as well as a key under the root data object, and SharedObjects only need one key.
				// Maybe we can default the shared object's key to be derived from the data objects key by default?
				tree: treeDataObject(
					"tree",
					new TreeViewConfiguration({ schema: Inventory }),
					() => new Inventory({ nuts: 5, bolts: 6 }),
				),
			},
		} satisfies ContainerSchema;

		// TODO: Ideally we would use a local-server service-client, but one does not appear to exist.
		const tinyliciousClient = new TinyliciousClient();

		const { container } = await tinyliciousClient.createContainer(containerSchema, "2");
		const tree = container.initialObjects.tree;
		assert.equal(tree.tree.root.nuts, 5);
		tree.tree.root.nuts += 1;
		assert.equal(tree.tree.root.bolts, 6);
	});
});
