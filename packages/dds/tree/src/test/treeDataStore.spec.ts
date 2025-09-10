/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import {
	SchemaFactory,
	SchemaFactoryAlpha,
	TreeViewConfiguration,
} from "../simple-tree/index.js";

import { dataStoreKind, treeDataStoreKind } from "../treeDataStore.js";
import { createEphemeralServiceClient } from "@fluidframework/local-driver/internal";
import { createContainer } from "@fluidframework/runtime-definitions/internal";
import { SharedTree } from "../treeFactory.js";

describe("treeDataStore", () => {
	it("collaboration example", async () => {
		const myFactory = treeDataStoreKind({
			type: "my-tree",
			config: new TreeViewConfiguration({ schema: SchemaFactoryAlpha.number }),
			initializer: () => 1,
		});

		const service = createEphemeralServiceClient();

		const container1 = await service.attachContainer(createContainer(myFactory));

		assert.equal(container1.root.root, 1);

		const container2 = await service.loadContainer(container1.id, myFactory);

		assert.equal(container2.root.root, 1);

		container2.root.root = 2;
		assert.equal(container1.root.root, 2);
		assert.equal(container2.root.root, 1);
	});

	it("schema evolution example", async () => {
		// Create, save then reopen a document.

		const service = createEphemeralServiceClient();

		let id: string;

		{
			const myFactory = treeDataStoreKind({
				type: "my-tree",
				config: new TreeViewConfiguration({ schema: SchemaFactoryAlpha.number }),
				initializer: () => 1,
			});

			const container = await service.attachContainer(createContainer(myFactory));
			id = container.id;
		}

		{
			const myFactory = treeDataStoreKind({
				type: "my-tree",
				config: new TreeViewConfiguration({
					schema: [SchemaFactoryAlpha.number, SchemaFactory.string],
				}),
				initializer: () => 2,
			});

			const container = await service.loadContainer(id, myFactory);
			assert.equal(container.root.compatibility.canView, false);
			container.root.upgradeSchema();
			assert.equal(container.root.root, 1);
		}
	});

	it("lazy loading example", async () => {
		// A minimal datastore which lazy loads SharedTree when needed.
		const myFactory = dataStoreKind({
			type: "my-tree",
			registry: async (type) => (await import("../treeFactory.js")).SharedTree,
			instantiateFirstTime: async (creator) =>
				creator.create((await import("../treeFactory.js")).SharedTree),
			view: (tree) => tree,
		});

		const container = createContainer(myFactory);

		assert(SharedTree.is(container.root));

		const service = createEphemeralServiceClient();
		const attached = await service.attachContainer(container);

		// Example using a registry which could (though in this case does not), lazy load the actual DataStoreKind as well.
		const lazyContainer = await service.loadContainer(attached.id, async () => myFactory);

		assert(SharedTree.is(lazyContainer.root));
	});
});
