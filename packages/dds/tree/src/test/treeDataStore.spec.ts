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
import { dataStoreKind } from "@fluidframework/shared-object-base/internal";
import { treeDataStoreKind } from "../treeDataStore.js";
import {
	createEphemeralServiceClient,
	synchronizeLocalService,
} from "@fluidframework/local-driver/internal";
import { SharedTree } from "../treeFactory.js";

describe("treeDataStore", () => {
	it("detached example", async () => {
		const myFactory = treeDataStoreKind({
			type: "my-tree",
			config: new TreeViewConfiguration({ schema: SchemaFactoryAlpha.number }),
			initializer: () => 1,
		});

		const service = createEphemeralServiceClient();
		const detached = await service.createContainer(myFactory);

		assert.equal(detached.data.root, 1);
		detached.data.root = 2;
		assert.equal(detached.data.root, 2);
	});

	it("attach example", async () => {
		const myFactory = treeDataStoreKind({
			type: "my-tree",
			config: new TreeViewConfiguration({ schema: SchemaFactoryAlpha.number }),
			initializer: () => 1,
		});

		const service = createEphemeralServiceClient();
		const detached = await service.createContainer(myFactory);
		const attached = await detached.attach();

		assert.equal(attached.data.root, 1);
	});

	it("collaboration example", async () => {
		const myFactory = treeDataStoreKind({
			type: "my-tree",
			config: new TreeViewConfiguration({ schema: SchemaFactoryAlpha.number }),
			initializer: () => 1,
		});

		const service = createEphemeralServiceClient();

		// Someday it would be nice to support this pattern, but that is longer term.
		// const container1 = await service.attachContainer(createContainer(myFactory));

		const container1 = await (await service.createContainer(myFactory)).attach();

		assert.equal(container1.data.root, 1);

		const container2 = await service.loadContainer(container1.id, myFactory);

		assert.equal(container2.data.root, 1);

		container2.data.root = 2;

		await synchronizeLocalService();

		assert.equal(container1.data.root, 2);
		assert.equal(container2.data.root, 2);
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

			const container = await (await service.createContainer(myFactory)).attach();
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
			assert.equal(container.data.compatibility.canView, false);
			container.data.upgradeSchema();
			assert.equal(container.data.root, 1);
		}
	});

	it("lazy loading example", async () => {
		// A minimal datastore which lazy loads SharedTree when needed.
		const myFactory = dataStoreKind({
			type: "my-tree",
			registry: async () => {
				const module = await import("../treeFactory.js");
				return (type) => module.SharedTree;
			},
			instantiateFirstTime: async (creator) =>
				creator.create((await import("../treeFactory.js")).SharedTree),
			view: async (tree) => tree,
		});

		const service = createEphemeralServiceClient();
		const container = await service.createContainer(myFactory);

		assert(SharedTree.is(container.data));

		const attached = await container.attach();

		// Example using a registry which could (though in this case does not), lazy load the actual DataStoreKind as well.
		const lazyContainer = await service.loadContainer(attached.id, async () => myFactory);

		assert(SharedTree.is(lazyContainer.data));
	});
});
