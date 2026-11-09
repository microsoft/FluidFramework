/*!
 * Copyright (c) Microsoft Corporation and contributors. All rights reserved.
 * Licensed under the MIT License.
 */

import {
	startEphemeralService,
	cleanupEphemeralService,
} from "@fluidframework/local-driver/alpha";
import {
	ServiceClient,
	defineTreeDataStore,
	TreeViewConfiguration,
	SchemaFactory,
	configuredSharedTree,
	defineDataStore,
	dataStoreRegistryFromIterable,
	type DataStoreKind,
	type DataStoreCreator,
	type ITree,
} from "fluid-framework/alpha";
import { strict as assert } from "node:assert";

// This package is a nice place to put code examples which import from user facing API surfaces like fluid-framework to validate that works end to end.

describe("examples", () => {
	afterEach(async () => {
		await cleanupEphemeralService();
	});

	it("reserves the root before asynchronous creation completes", async () => {
		const SharedTree = configuredSharedTree({});
		const service = startEphemeralService();
		const client = service.newClient({ oldestSupportedClient: "3.12.0" });
		const kind = defineDataStore<ITree, ITree>({
			type: "single-root",
			registry: dataStoreRegistryFromIterable([SharedTree]),
			async instantiateFirstTime(creator) {
				const first = creator.createDataStore(SharedTree);
				await assert.rejects(creator.createDataStore(SharedTree), /Root already created/);
				return first;
			},
			view: async (root) => root,
		});
		const container = await client.createAttachedContainer(kind);
		const loaded = await client.loadContainer(container.id, kind);
		assert(loaded.data !== undefined);
	});

	for (const scenario of ["missing root", "different root"] as const) {
		it(`rejects initialization returning a ${scenario}`, async () => {
			const SharedTree = configuredSharedTree({});
			const service = startEphemeralService();
			const client = service.newClient({ oldestSupportedClient: "3.12.0" });
			const kind = defineDataStore<unknown, unknown>({
				type: scenario,
				registry: dataStoreRegistryFromIterable([SharedTree]),
				async instantiateFirstTime(creator) {
					if (scenario === "different root") await creator.createDataStore(SharedTree);
					return {};
				},
				view: async () => assert.fail("Invalid initialization must not construct a view"),
			});
			await assert.rejects(
				client.createContainer(kind),
				/did not return the root created with rootCreator/,
			);
		});
	}

	it("uses unified alpha kinds at container and nested scopes", async () => {
		const SharedTree = configuredSharedTree({});
		const service = startEphemeralService();
		const client = service.newClient({ oldestSupportedClient: "3.12.0" });
		const config = new TreeViewConfiguration({
			schema: [SchemaFactory.number, SchemaFactory.handle],
		});
		const numberConfig = new TreeViewConfiguration({ schema: SchemaFactory.number });
		let loads = 0;
		const child = defineDataStore<ITree, ITree>({
			type: "number-child",
			registry: dataStoreRegistryFromIterable([SharedTree]),
			async instantiateFirstTime(creator) {
				const tree = await creator.createDataStore(SharedTree);
				const view = tree.viewWith(numberConfig);
				view.initialize(42);
				view.dispose();
				return tree;
			},
			view: async (root) => root,
		});
		const parent = defineDataStore<{ root: ITree; creator: DataStoreCreator }, ITree>({
			type: "parent",
			registry: dataStoreRegistryFromIterable([
				SharedTree,
				{
					type: child.type,
					kind: async () => {
						loads++;
						return child;
					},
				},
			]),
			async instantiateFirstTime(rootCreator, creator) {
				const root = await rootCreator.createDataStore(SharedTree);
				const view = root.viewWith(config);
				view.initialize(1);
				const nested = await creator.createDataStore(child);
				view.root = nested.handle;
				view.dispose();
				return root;
			},
			view: async (root, creator) => ({ root, creator }),
		});
		const registry = dataStoreRegistryFromIterable([parent, SharedTree]);
		const container = await client.createAttachedContainer(parent, registry);
		assert.equal(loads, 1);
		assert.equal("handle" in container.data, false);
		await service.synchronize();
		const remote = await client.loadContainer(container.id, registry);
		// The multi-kind registry erases the root type; this document was created with parent.
		const remoteData = remote.data as typeof container.data;
		const remoteView = remoteData.root.viewWith(config);
		const nestedHandle = remoteView.root;
		assert(typeof nestedHandle !== "number");
		const nestedView = ((await nestedHandle.get()) as ITree).viewWith(numberConfig);
		assert.equal(nestedView.root, 42);
		nestedView.root = 43;
		await service.synchronize();
		const localView = container.data.root.viewWith(config);
		const localNested = localView.root;
		assert(typeof localNested !== "number");
		assert.equal(((await localNested.get()) as ITree).viewWith(numberConfig).root, 43);
		const additionalChild = await remoteData.creator.createDataStore(child);
		assert.equal(additionalChild.viewWith(numberConfig).root, 42);
		assert.equal(loads, 1);

		const extra = await container.createDataStore(SharedTree);
		extra.viewWith(config).initialize(7);
		localView.root = extra.handle;
		await service.synchronize();
		const extraHandle = remoteView.root;
		assert(typeof extraHandle !== "number");
		assert.equal(((await extraHandle.get()) as ITree).viewWith(config).root, 7);

		// A composite's application value may be undefined, even when it is another composite's root.
		const handleFree = defineDataStore<undefined, ITree>({
			type: "handle-free",
			registry: dataStoreRegistryFromIterable([SharedTree]),
			instantiateFirstTime: async (creator) => creator.createDataStore(SharedTree),
			view: async () => undefined,
		});
		const composite: DataStoreKind<number> = defineDataStore<number, undefined>({
			type: "composite-root",
			registry: dataStoreRegistryFromIterable([handleFree]),
			instantiateFirstTime: async (creator) => creator.createDataStore(handleFree),
			view: async () => 5,
		});
		const compositeContainer = await client.createAttachedContainer(composite);
		const loadedComposite = await client.loadContainer(compositeContainer.id, composite);
		assert.equal(loadedComposite.data, 5);
		const direct = await client.createAttachedContainer(SharedTree);
		direct.data.viewWith(config).initialize(9);
		await service.synchronize();
		const loadedDirect = await client.loadContainer(direct.id, SharedTree);
		assert.equal(loadedDirect.data.viewWith(config).root, 9);
	});

	it("self contained example", async () => {
		// import { startEphemeralService, cleanupEphemeralService } from "@fluidframework/local-driver/alpha";
		// import { ServiceClient, defineTreeDataStore, TreeViewConfiguration, SchemaFactory } from "fluid-framework/alpha";
		// import { strict as assert } from "node:assert";

		// Create an ephemeral in-memory service, and a ServiceClient connected to it.
		// The service owns the in-memory documents and their lifetime; close it to release its resources.
		const service = startEphemeralService();
		const client: ServiceClient = service.defaultClient;
		// Define a DataStoreKind which uses a SharedTree.
		// In this case the schema is for a single number with an initializer that starts the it at 1.
		// This schema is captures in the type allowing for strongly typed access to the data in the tree,
		// where the type matches the schema based runtime enforcement of the schema.
		const numberStore = defineTreeDataStore({
			type: "my-app-root",
			config: new TreeViewConfiguration({ schema: SchemaFactory.number }),
			initializer: () => 1,
		});

		// Create a container in the service with the above DataStoreKind.
		// Ideally this creation would use a service independent API, and only the attach call would be service dependent,
		// but that is not supported yet.
		const detachedContainer1 = await client.createContainer(numberStore);
		const container1 = await detachedContainer1.attach();

		// We now have easy and type safe access to the data in the tree, which will be synced over the service.
		assert.equal(container1.data.root, 1);

		// A second client can load the same container from the service, and will see the same data.
		const container2 = await client.loadContainer(container1.id, numberStore);
		assert.equal(container2.data.root, 1);

		// Both clients can modify the data, and the changes will be synced over the service.
		container2.data.root = 2;
		// Since we are using an ephemeral service, we can await the synchronization using service.synchronize.
		await service.synchronize();

		// And now the changes are visible for all clients.
		assert.equal(container1.data.root, 2);
		assert.equal(container2.data.root, 2);
	});
});
