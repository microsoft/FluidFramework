/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IFluidLoadable } from "@fluidframework/core-interfaces";
import { startEphemeralService } from "@fluidframework/local-driver/internal";
import {
	defineDataStore,
	dataStoreRegistryFromIterable,
} from "@fluidframework/shared-object-base/internal";

import { SchematizingSimpleTreeView, Tree } from "../shared-tree/index.js";
import {
	SchemaFactory,
	SchemaFactoryAlpha,
	TreeViewConfiguration,
	type ITree,
} from "../simple-tree/index.js";
import { instantiateTreeFirstTime, defineTreeDataStore } from "../treeDataStore.js";
import { SharedTree, SharedTreeAlpha } from "../treeFactory.js";

describe("treeDataStore", () => {
	// See also examples/utils/import-testing/src/test/apiExamples.spec.ts for examples which are more public facing and have imports not allowed in this package.

	it("uses a shared object directly as the container root and as an additional item", async () => {
		const service = startEphemeralService();
		const client = service.newClient({ oldestSupportedClient: "3.12.0" });
		const config = new TreeViewConfiguration({
			schema: [SchemaFactoryAlpha.number, SchemaFactory.handle],
		});
		const container = await client.createAttachedContainer(SharedTreeAlpha);
		const root = container.data.viewWith(config);
		root.initialize(1);
		const child = await container.createDataStore(SharedTreeAlpha);
		const childView = child.viewWith(config);
		childView.initialize(42);
		root.root = child.handle;
		await service.synchronize();
		const remote = await client.loadContainer(container.id, SharedTreeAlpha);
		const remoteView = remote.data.viewWith(config);
		assert(Tree.is(remoteView.root, SchemaFactoryAlpha.handle));
		const remoteChild = (await remoteView.root.get()) as ITree;
		const remoteChildView = remoteChild.viewWith(config);
		assert.equal(remoteChildView.root, 42);
		remoteChildView.root = 43;
		await service.synchronize();
		assert.equal(childView.root, 43);
	});

	it("uses composite kinds as roots and additional contents", async () => {
		const service = startEphemeralService();
		const client = service.newClient({ oldestSupportedClient: "3.12.0" });
		const childKind = defineDataStore<ITree, ITree>({
			type: "child",
			registry: dataStoreRegistryFromIterable([SharedTreeAlpha]),
			instantiateFirstTime: async (creator) => creator.createDataStore(SharedTreeAlpha),
			view: async (root) => root,
		});
		const parentKind = defineDataStore<ITree, ITree>({
			type: "parent",
			registry: dataStoreRegistryFromIterable([childKind, SharedTreeAlpha]),
			async instantiateFirstTime(rootCreator, context) {
				const root = await rootCreator.createDataStore(childKind);
				const config = new TreeViewConfiguration({
					schema: [SchemaFactoryAlpha.number, SchemaFactory.handle],
				});
				const rootView = root.viewWith(config);
				const createdChild = await context.createDataStore(childKind);
				createdChild.viewWith(config).initialize(42);
				rootView.initialize(createdChild.handle);
				return root;
			},
			view: async (root) => root,
		});
		const container = await client.createAttachedContainer(parentKind);
		await service.synchronize();
		const remote = await client.loadContainer(container.id, parentKind);
		const view = remote.data.viewWith(
			new TreeViewConfiguration({
				schema: [SchemaFactoryAlpha.number, SchemaFactory.handle],
			}),
		);
		assert(Tree.is(view.root, SchemaFactoryAlpha.handle));
		const child = (await view.root.get()) as ITree;
		assert.equal(
			child.viewWith(
				new TreeViewConfiguration({
					schema: [SchemaFactoryAlpha.number, SchemaFactory.handle],
				}),
			).root,
			42,
		);
	});

	it("tracks root identity independently of an undefined application value", async () => {
		const service = startEphemeralService();
		const client = service.newClient({ oldestSupportedClient: "3.12.0" });
		const child = defineDataStore<undefined, ITree>({
			type: "undefined-view",
			registry: dataStoreRegistryFromIterable([SharedTreeAlpha]),
			instantiateFirstTime: async (creator) => creator.createDataStore(SharedTreeAlpha),
			view: async () => undefined,
		});
		const parent = defineDataStore<number, undefined>({
			type: "undefined-root",
			registry: dataStoreRegistryFromIterable([child]),
			instantiateFirstTime: async (creator) => creator.createDataStore(child),
			view: async (root) => {
				assert.equal(root, undefined);
				return 42;
			},
		});
		const container = await client.createAttachedContainer(parent);
		const remote = await client.loadContainer(container.id, parent);
		assert.equal(remote.data, 42);
	});

	it("supports DDS-only stores at old targets but rejects direct leaf hosting", async () => {
		const service = startEphemeralService();
		const client = service.newClient({ oldestSupportedClient: "2.0.0" });
		const kind = defineTreeDataStore({
			type: "compatible-tree",
			config: new TreeViewConfiguration({ schema: SchemaFactory.number }),
			initializer: () => 1,
		});
		const container = await client.createAttachedContainer(kind);
		const remote = await client.loadContainer(container.id, kind);
		assert.equal(remote.data.root, 1);
		await assert.rejects(
			client.createContainer(SharedTreeAlpha),
			/Direct shared-object hosting requires/,
		);
	});

	it("detached example", async () => {
		const myFactory = defineTreeDataStore({
			type: "my-tree",
			config: new TreeViewConfiguration({ schema: SchemaFactoryAlpha.number }),
			initializer: () => 1,
		});

		const client = startEphemeralService().defaultClient;
		const detached = await client.createContainer(myFactory);

		assert.equal(detached.data.root, 1);
		detached.data.root = 2;
		assert.equal(detached.data.root, 2);
	});

	it("attach example", async () => {
		const myFactory = defineTreeDataStore({
			type: "my-tree",
			config: new TreeViewConfiguration({ schema: SchemaFactoryAlpha.number }),
			initializer: () => 1,
		});

		const client = startEphemeralService().defaultClient;
		const detached = await client.createContainer(myFactory);
		const attached = await detached.attach();

		assert.equal(attached.data.root, 1);
	});

	it("collaboration example", async () => {
		const myFactory = defineTreeDataStore({
			type: "my-tree",
			config: new TreeViewConfiguration({ schema: SchemaFactoryAlpha.number }),
			initializer: () => 1,
		});

		const client = startEphemeralService().newClient({ oldestSupportedClient: "2.20.0" });

		// Someday it would be nice to support this pattern, but that is longer term.
		// const container1 = await service.attachContainer(createContainer(myFactory));

		const container1 = await client.createAttachedContainer(myFactory);

		assert.equal(container1.data.root, 1);

		const container2 = await client.loadContainer(container1.id, myFactory);

		assert.equal(container2.data.root, 1);

		container2.data.root = 2;

		await client.service.synchronize();

		assert.equal(container1.data.root, 2);
		assert.equal(container2.data.root, 2);
	});

	it("schema evolution example", async () => {
		// Create, save then reopen a document.

		const client = startEphemeralService().defaultClient;

		let id: string;

		{
			const myFactory = defineTreeDataStore({
				type: "my-tree",
				config: new TreeViewConfiguration({ schema: SchemaFactoryAlpha.number }),
				initializer: () => 1,
			});

			const container = await client.createAttachedContainer(myFactory);
			id = container.id;
		}

		{
			const myFactory = defineTreeDataStore({
				type: "my-tree",
				config: new TreeViewConfiguration({
					schema: [SchemaFactoryAlpha.number, SchemaFactory.string],
				}),
				initializer: () => 2,
			});

			const container = await client.loadContainer(id, myFactory);
			assert.equal(container.data.compatibility.canView, false);
			container.data.upgradeSchema();
			assert.equal(container.data.root, 1);
		}
	});

	it("lazy loading example", async () => {
		// A minimal datastore which lazy loads SharedTree when needed.
		const myFactory = defineDataStore<ITree, ITree>({
			type: "my-tree",
			registry: async () => {
				const module = await import("../treeFactory.js");
				return module.SharedTreeAlpha;
			},
			instantiateFirstTime: async (creator) => {
				const { SharedTreeAlpha: SharedTreeFactory } = await import("../treeFactory.js");
				return creator.createDataStore(SharedTreeFactory);
			},
			view: async (tree) => tree,
		});

		const client = startEphemeralService().defaultClient;
		const container = await client.createContainer(myFactory);

		assert(SharedTree.is(container.data));

		const attached = await container.attach();

		// Example using a registry which could (though in this case does not), lazy load the actual DataStoreKind as well.
		const lazyContainer = await client.loadContainer(attached.id, async () => myFactory);

		assert(SharedTree.is(lazyContainer.data));
	});

	it("createDataStore", async () => {
		const myFactory = defineTreeDataStore({
			type: "my-tree",
			config: new TreeViewConfiguration({
				schema: [SchemaFactoryAlpha.number, SchemaFactory.handle],
			}),
			initializer: () => 1,
		});

		const client = startEphemeralService().defaultClient;
		const container = await client.createContainer(myFactory);

		const secondTree = await container.createDataStore(myFactory);

		assert((secondTree as unknown) instanceof SchematizingSimpleTreeView);

		secondTree.root = 2;

		assert.equal(secondTree.root, 2);
	});

	it("createDataStore: collaboration in attached datastore", async () => {
		const config = new TreeViewConfiguration({
			schema: [SchemaFactoryAlpha.number, SchemaFactory.handle],
		});

		// A DataStore which is an initialized ITree with the above config.
		const MyTree = defineDataStore<ITree, ITree>({
			type: "my-tree",
			registry: async () => SharedTreeAlpha,
			async instantiateFirstTime(rootCreator, creator): Promise<ITree> {
				return instantiateTreeFirstTime(rootCreator, creator, SharedTreeAlpha, {
					config,
					initializer: () => 1,
				});
			},
			view: async (tree) => tree,
		});

		const client = startEphemeralService().defaultClient;

		// Create a container with a MyTree as the data
		const container1 = await client.createAttachedContainer(MyTree);

		// Create a second MyTree in the container, and put a handle to it in the root data.
		{
			const mainView = container1.data.viewWith(config);
			const secondTree = await container1.createDataStore(MyTree);
			const secondView = secondTree.viewWith(config);
			secondView.root = 3;

			// Attach the second tree by placing a handle to it in the first.
			mainView.root = secondTree.handle;
		}

		await client.service.synchronize();

		// Load the container, traverse the handle, and confirm the second tree is as expected.
		{
			const container2 = await client.loadContainer(container1.id, MyTree);
			const mainView = container2.data.viewWith(config);
			assert(Tree.is(mainView.root, SchemaFactoryAlpha.handle));

			const secondTree = (await mainView.root.get()) as IFluidLoadable;
			assert(SharedTree.is(secondTree));
			assert.equal(secondTree.viewWith(config).root, 3);
		}
	});
});
