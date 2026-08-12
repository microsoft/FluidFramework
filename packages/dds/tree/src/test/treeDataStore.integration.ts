/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from "node:assert";

import type { IFluidLoadable } from "@fluidframework/core-interfaces";
import { startEphemeralService } from "@fluidframework/local-driver/internal";
import { defineDataStore } from "@fluidframework/shared-object-base/internal";

import { ForestTypeOptimized, Tree } from "../shared-tree/index.js";
import {
	SchemaFactory,
	SchemaFactoryAlpha,
	TreeViewConfiguration,
	type ITree,
} from "../simple-tree/index.js";
import { instantiateTreeFirstTime } from "../treeDataStore.js";
import { configuredSharedTree, SharedTree } from "../treeFactory.js";

describe("treeDataStore integration tests", () => {
	// See also examples/utils/import-testing/src/test/apiExamples.spec.ts for examples which are more public facing and have imports not allowed in this package.
	it("remains editable after a nodeChanged listener throws", async () => {
		const schema = new SchemaFactory("listener-throw");
		class Numbers extends schema.array("Numbers", schema.number) {}
		const config = new TreeViewConfiguration({ schema: Numbers });
		const ConfiguredTree = configuredSharedTree({ forest: ForestTypeOptimized });
		const MyTree = defineDataStore<ITree, ITree>({
			type: "listener-throw-tree",
			registry: async () => () => ConfiguredTree,
			async instantiateFirstTime(rootCreator, creator): Promise<ITree> {
				return instantiateTreeFirstTime(rootCreator, creator, ConfiguredTree, {
					config,
					initializer: () => [0, 1, 2],
				});
			},
			view: async (tree) => tree,
		});

		const client = startEphemeralService().defaultClient;
		const container = await client.createAttachedContainer(MyTree);
		const view = container.data.viewWith(config);
		const listenerError = new Error("Expected listener failure");
		const unsubscribe = Tree.on(view.root, "nodeChanged", () => {
			throw listenerError;
		});

		assert.throws(() => view.root.removeAt(0), listenerError);
		unsubscribe();

		// The listener failure must not permanently prevent later edits on the checkout.
		view.root.removeAt(0);
	});

	it("does not corrupt SharedTree when attach is rejected during a transaction", async () => {
		const schema = new SchemaFactory("attach-transaction");
		class Numbers extends schema.array("Numbers", schema.number) {}
		const config = new TreeViewConfiguration({ schema: Numbers });
		const ConfiguredTree = configuredSharedTree({ forest: ForestTypeOptimized });
		const MyTree = defineDataStore<ITree, ITree>({
			type: "attach-transaction-tree",
			registry: async () => () => ConfiguredTree,
			async instantiateFirstTime(rootCreator, creator): Promise<ITree> {
				return instantiateTreeFirstTime(rootCreator, creator, ConfiguredTree, {
					config,
					initializer: () => [0],
				});
			},
			view: async (tree) => tree,
		});

		const client = startEphemeralService().defaultClient;
		const detached = await client.createContainer(MyTree);
		const view = detached.data.viewWith(config);
		let attachPromise: ReturnType<typeof detached.attach> | undefined;
		Tree.runTransaction(view, () => {
			view.root.insertAtEnd(1);
			attachPromise = detached.attach();
		});
		assert(attachPromise !== undefined);
		await assert.rejects(attachPromise, /Cannot attach while a transaction is in progress/);

		// Rejecting the unsupported attach attempt must not poison the tree or its transaction.
		assert.deepEqual([...view.root], [0, 1]);
	});

	it("collaboration with ForestTypeOptimized", async () => {
		const config = new TreeViewConfiguration({
			schema: [SchemaFactoryAlpha.number, SchemaFactory.handle],
		});

		const ConfiguredTree = configuredSharedTree({ forest: ForestTypeOptimized });

		const MyTree = defineDataStore<ITree, ITree>({
			type: "my-tree",
			registry: async () => () => ConfiguredTree,
			async instantiateFirstTime(rootCreator, creator): Promise<ITree> {
				return instantiateTreeFirstTime(rootCreator, creator, ConfiguredTree, {
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
